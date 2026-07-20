from calendar import monthrange
from datetime import date, datetime, timedelta

from django.db.models import Count, Q
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError

from apps.core.mixins import BaseModelViewSet, EmployeeSelfScopedMixin
from apps.accounts.models import Role
from apps.farms.views import FarmScopedQuerysetMixin
from apps.gps.utils import haversine_m, location_inside_farm, reverse_geocode

from .models import (
    Employee,
    Shift,
    WorkforceAllocation,
    Attendance,
    AttendanceMonthlySummary,
    Department,
    Skill,
    EmploymentHistory,
    PerformanceReview,
    Availability,
)
from .serializers import (
    EmployeeSerializer,
    ShiftSerializer,
    WorkforceAllocationSerializer,
    AttendanceSerializer,
    DepartmentSerializer,
    SkillSerializer,
    EmploymentHistorySerializer,
    PerformanceReviewSerializer,
    AvailabilitySerializer,
)


class EmployeeViewSet(EmployeeSelfScopedMixin, FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = Employee.objects.select_related("farm", "user", "department").prefetch_related("skills").all()
    serializer_class = EmployeeSerializer

    def get_queryset(self):
        """Return all employees, allowing filtering by employee ID.
        For EMPLOYEE roles, if no specific employee filter is provided,
        they will still be scoped to their own records by EmployeeSelfScopedMixin.
        Otherwise, if an employee filter is provided, it will be applied."""
        qs = super().get_queryset()
        # The EmployeeSelfScopedMixin now handles conditional self-scoping based on the
        # presence of an 'employee' filter. This method no longer needs to
        # explicitly filter for EMPLOYEE roles.
        # Super admins are not workforce members: their Employee record exists
        # only to link the login, so it is hidden from every viewer — including
        # other super admins — on the Employees page and in every
        # "Assign to Worker" dropdown. Matched on both sides of the link, since
        # the SUPER_ADMIN category can also be set manually.
        qs = qs.exclude(user__role=Role.SUPER_ADMIN).exclude(
            category=Employee.Category.SUPER_ADMIN
        )
        return qs
    farm_lookup = "farm_id"
    employee_self_lookup = "user"  # Employee links directly to the user
    allowed_roles = [Role.FARM_MANAGER, Role.EMPLOYEE]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["farm", "category", "employment_type", "wage_type", "is_active", "department", "user"]
    search_fields = ["first_name", "last_name", "employee_code", "phone", "designation"]

    @action(detail=True, methods=["get"])
    def financial_summary(self, request, pk=None):
        """Return purchases, sales & payments linked to this employee.
        Only visible to admin/farm-manager roles."""
        allowed = {Role.SUPER_ADMIN, Role.FARM_MANAGER}
        if request.user.role not in allowed:
            return Response({"detail": "Not authorized."}, status=403)

        employee = self.get_object()

        from apps.finance.models import Purchase, Sale, Payment
        from apps.finance.serializers import PurchaseSerializer, SaleSerializer, PaymentSerializer

        purchases = Purchase.objects.filter(employee=employee).select_related(
            "farm"
        )
        sales = Sale.objects.filter(employee=employee).select_related("farm", "crop")
        payments = Payment.objects.filter(employee=employee).select_related(
            "farm"
        )

        return Response({
            "employee_id": employee.id,
            "employee_name": employee.name,
            "purchases": PurchaseSerializer(purchases, many=True, context={"request": request}).data,
            "sales": SaleSerializer(sales, many=True, context={"request": request}).data,
            "payments": PaymentSerializer(payments, many=True, context={"request": request}).data,
        })

    @action(detail=False, methods=["get"])
    def monitor(self, request):
        """Workforce monitoring snapshot: active counts + today's allocation/availability."""
        qs = self.filter_queryset(self.get_queryset())
        active = qs.filter(is_active=True)
        today = timezone.localdate()

        by_category = list(
            active.values("category").annotate(count=Count("id")).order_by("-count")
        )
        by_department = [
            {"department": row["department__name"] or "Unassigned", "count": row["count"]}
            for row in active.values("department__name")
            .annotate(count=Count("id"))
            .order_by("-count")
        ]

        emp_ids = list(active.values_list("id", flat=True))
        allocated_today = (
            WorkforceAllocation.objects.filter(employee_id__in=emp_ids, date=today)
            .values("employee")
            .distinct()
            .count()
        )
        on_leave_today = (
            Availability.objects.filter(
                employee_id__in=emp_ids,
                status=Availability.Status.ON_LEAVE,
                start_date__lte=today,
            )
            .filter(Q(end_date__gte=today) | Q(end_date__isnull=True))
            .values("employee")
            .distinct()
            .count()
        )

        return Response(
            {
                "total_active": active.count(),
                "total_inactive": qs.filter(is_active=False).count(),
                "by_category": by_category,
                "by_department": by_department,
                "allocated_today": allocated_today,
                "on_leave_today": on_leave_today,
                "available_estimate": max(active.count() - on_leave_today, 0),
            }
        )


class ShiftViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = Shift.objects.select_related("farm").all()
    serializer_class = ShiftSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["farm"]
    search_fields = ["name"]


class WorkforceAllocationViewSet(EmployeeSelfScopedMixin, FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = WorkforceAllocation.objects.select_related(
        "employee", "farm", "field", "shift"
    ).all()
    serializer_class = WorkforceAllocationSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["employee", "farm", "field", "shift", "date"]
    search_fields = ["work_description"]


class AttendanceViewSet(EmployeeSelfScopedMixin, FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = Attendance.objects.select_related(
        "employee", "farm", "approved_by"
    ).all()
    serializer_class = AttendanceSerializer
    farm_lookup = "farm_id"
    employee_self_lookup = "employee__user"  # Explicitly set to make sure employees only see their own records
    allowed_roles = [Role.FARM_MANAGER, Role.EMPLOYEE]
    readonly_roles = []
    filterset_fields = ["employee", "farm", "date", "status", "approval_status"]
    search_fields = ["remarks"]

    def get_queryset(self):
        qs = super().get_queryset()
        # Date range filters
        date_after = self.request.query_params.get("date_after")
        date_before = self.request.query_params.get("date_before")
        if date_after:
            qs = qs.filter(date__gte=date_after)
        if date_before:
            qs = qs.filter(date__lte=date_before)
        return qs

    def perform_update(self, serializer):
        # When the check-in / check-out times are edited, re-derive Status,
        # Approval and Work Hours from the new times (same rules as check_out)
        # so the table columns update automatically. Edits that don't touch
        # the times keep the manually chosen status/approval untouched.
        old_in = serializer.instance.check_in_time
        old_out = serializer.instance.check_out_time
        attendance = serializer.save()
        if attendance.check_in_time == old_in and attendance.check_out_time == old_out:
            return
        attendance.refresh_time_derived_fields()
        attendance.save()

    def _addressable_employees(self):
        """Employees this caller may record attendance for.

        Employees on the caller's farms, plus whichever Employee row is already
        linked to them — the second half matters because an employee whose
        ``user.farms`` has drifted from their Employee's farm must still be able
        to check themselves in.

        These lookups used to run against ``Employee.objects`` unscoped, which
        let a manager or admin post a raw employee id and create (and back-date)
        attendance for another tenant's worker, feeding that tenant's payroll.
        """
        user = self.request.user
        return Employee.objects.filter(
            Q(farm_id__in=user.farms.values_list("id", flat=True)) | Q(user=user)
        )

    @action(detail=False, methods=["post"])
    def check_in(self, request):
        """Create or update today's attendance with check-in details."""
        employee_id = request.data.get("employee")
        if not employee_id:
            return Response({"detail": "employee is required."}, status=400)

        employee = self._addressable_employees().filter(pk=employee_id).first()
        if not employee:
            return Response({"detail": "Employee not found."}, status=404)

        # Auto-link the employee's user if not set (EMPLOYEE users only)
        if employee.user is None and request.user.role == Role.EMPLOYEE:
            Employee.objects.filter(pk=employee.pk).update(user=request.user)
            employee.user = request.user

        # An employee may only check in for themselves.
        if request.user.role == Role.EMPLOYEE and employee.user_id != request.user.pk:
            return Response({"detail": "You may only check in for yourself."}, status=403)

        attendance = self._do_check_in(employee, request)
        serializer = self.get_serializer(attendance, context={'request': request})
        return Response(serializer.data, status=200)

    @action(detail=False, methods=["post"])
    def check_in_by_code(self, request):
        """Check in using employee_code instead of employee PK.

        Useful when the logged-in user does not yet have a linked Employee
        profile.  Only available for EMPLOYEE role users (self-check-in).
        """
        if request.user.role != Role.EMPLOYEE:
            return Response({"detail": "Only employees can use code check-in."}, status=403)

        code = request.data.get("employee_code", "").strip()
        if not code:
            return Response({"detail": "employee_code is required."}, status=400)

        # Scoped: an unscoped code lookup let an employee of one tenant guess a
        # code belonging to another tenant's *unlinked* employee and get
        # permanently linked to it a few lines below, inheriting that worker's
        # record, attendance and payslips.
        employee = self._addressable_employees().filter(employee_code=code).first()
        if not employee:
            return Response({"detail": "No employee found with that code."}, status=404)

        # Only auto-link if the employee has no user OR it's the same user
        if employee.user is not None and str(employee.user_id) != str(request.user.pk):
            return Response({"detail": "This employee code is linked to another user."}, status=403)

        if employee.user is None:
            Employee.objects.filter(pk=employee.pk).update(user=request.user)
            employee.user = request.user

        attendance = self._do_check_in(employee, request)
        serializer = self.get_serializer(attendance, context={'request': request})
        return Response(serializer.data, status=200)

    def _resolve_attendance_datetime(self, request):
        """Return the (date, check-in datetime) to record for a check-in.

        Everyone gets LIVE attendance (today / now) by default. Only admins and
        farm managers may back-date it by sending ``date`` (YYYY-MM-DD) and/or
        ``check_in_time`` (``HH:MM``, ``HH:MM:SS``, or a full ISO datetime).
        A plain employee's date/time input is ignored so they can only ever
        mark live attendance.
        """
        now = timezone.now()
        att_date = timezone.localdate()
        check_in_dt = now

        privileged = request.user.role in (Role.SUPER_ADMIN, Role.FARM_MANAGER)
        if not privileged:
            return att_date, check_in_dt

        raw_date = (request.data.get("date") or "").strip()
        raw_time = (request.data.get("check_in_time") or "").strip()

        parsed_date = parse_date(raw_date) if raw_date else None
        if parsed_date:
            att_date = parsed_date

        parsed_dt = parse_datetime(raw_time) if raw_time else None
        if parsed_dt is None and raw_time:
            # Fall back to a time-only value ("HH:MM" / "HH:MM:SS").
            for fmt in ("%H:%M", "%H:%M:%S"):
                try:
                    parsed_dt = datetime.combine(att_date, datetime.strptime(raw_time, fmt).time())
                    break
                except ValueError:
                    continue

        if parsed_dt is not None:
            if timezone.is_naive(parsed_dt):
                parsed_dt = timezone.make_aware(parsed_dt, timezone.get_current_timezone())
            check_in_dt = parsed_dt
            if not parsed_date:
                att_date = timezone.localtime(parsed_dt).date()
        elif parsed_date:
            # Date given without a time → that date at the current wall-clock time.
            local_time = timezone.localtime(now).time()
            check_in_dt = timezone.make_aware(
                datetime.combine(att_date, local_time), timezone.get_current_timezone()
            )

        return att_date, check_in_dt

    def _do_check_in(self, employee, request):
        """Shared check-in logic used by both `check_in` and `check_in_by_code`.

        Sets GPS coordinates, computes distance from the farm centre, and uses
        geofence rules to auto-approve or fail the check-in.
        Creates attendance record ONLY on successful check-in.
        Also detects address from GPS coordinates.
        """
        with transaction.atomic():
            att_date, check_in_dt = self._resolve_attendance_datetime(request)

            # Resolve which farm the worker is checking into. Workers can be
            # assigned to multiple farms (user.farms); honour the farm they
            # picked, but only if it is one they are actually assigned to,
            # otherwise fall back to their primary farm.
            selected_farm = employee.farm
            req_farm_id = request.data.get("farm")
            if req_farm_id:
                from apps.farms.models import Farm
                cand = Farm.objects.filter(pk=req_farm_id).first()
                if cand:
                    allowed = set()
                    if employee.farm_id:
                        allowed.add(str(employee.farm_id))
                    if employee.user_id:
                        allowed |= {str(fid) for fid in employee.user.farms.values_list("id", flat=True)}
                    if not allowed or str(cand.id) in allowed:
                        selected_farm = cand

            # ── Geofence gate ─────────────────────────────────────────────────
            # Block an out-of-farm check-in BEFORE any record is created, so a
            # rejected attempt neither persists an attendance row nor fires the
            # "pending approval" notification signal (both would otherwise be
            # rolled back, but the notification's WebSocket push is not
            # transactional). Admins / farm managers are exempt so they can
            # record attendance for others while off-site. `code` lets the
            # frontend show a localized message.
            _lat_raw = request.data.get("check_in_lat")
            _lng_raw = request.data.get("check_in_lng")
            if _lat_raw is not None and _lng_raw is not None:
                _lat, _lng = float(_lat_raw), float(_lng_raw)
                _candidates = [selected_farm] if selected_farm else []
                if employee.user_id:
                    for _f in employee.user.farms.all():
                        if not any(cf and cf.id == _f.id for cf in _candidates):
                            _candidates.append(_f)
                _inside_any = any(
                    cf and location_inside_farm(cf, _lat, _lng) is True
                    for cf in _candidates
                )
                if not _inside_any:
                    _sel_inside = (
                        location_inside_farm(selected_farm, _lat, _lng)
                        if selected_farm else None
                    )
                    _privileged = request.user.role in (
                        Role.SUPER_ADMIN, Role.FARM_MANAGER,
                    )
                    if _sel_inside is False and not _privileged:
                        raise ValidationError({
                            "detail": (
                                "You are outside the farm area. Attendance can "
                                "only be marked from inside the farm boundary "
                                "(within the geofence tolerance). Please move "
                                "inside the farm and try again."
                            ),
                            "code": "outside_farm_area",
                        })

            # Check if attendance already exists for this date
            existing = Attendance.objects.filter(employee=employee, date=att_date).first()
            if existing and existing.check_in_time is not None:
                # Already checked in - return existing record
                return existing

            # Create or get attendance record
            if existing:
                attendance = existing
                attendance.farm = selected_farm
                attendance.created_by = request.user
            else:
                attendance = Attendance.objects.create(
                    employee=employee,
                    farm=selected_farm,
                    date=att_date,
                    created_by=request.user,
                )

            attendance.check_in_time = check_in_dt
            attendance.status = Attendance.Status.PRESENT
            if request.data.get("check_in_lat") is not None:
                attendance.check_in_lat = request.data.get("check_in_lat")
            if request.data.get("check_in_lng") is not None:
                attendance.check_in_lng = request.data.get("check_in_lng")
            check_in_photo = request.FILES.get("check_in_photo")
            if check_in_photo:
                attendance.check_in_photo = check_in_photo
            # Add check_in_notes
            if request.data.get("check_in_notes") is not None:
                attendance.check_in_notes = request.data.get("check_in_notes")

            # ── GPS Geofence Validation (uses location_inside_farm) ───────────
            lat = request.data.get("check_in_lat")
            lng = request.data.get("check_in_lng")
            if lat is not None and lng is not None:
                lat, lng = float(lat), float(lng)

                # Build the list of farms the worker is assigned to (the picked
                # farm first, then any other farms on their user account). The
                # worker counts as PRESENT if they are inside the geofence of
                # ANY assigned farm — we then record the farm they were actually
                # found at. Only when they are inside NONE of their farms are
                # they marked Absent.
                candidate_farms = [selected_farm] if selected_farm else []
                if employee.user_id:
                    for f2 in employee.user.farms.all():
                        if not any(cf and cf.id == f2.id for cf in candidate_farms):
                            candidate_farms.append(f2)

                matched_farm = None
                for cf in candidate_farms:
                    if cf and location_inside_farm(cf, lat, lng) is True:
                        matched_farm = cf
                        break

                attendance.approval_status = Attendance.ApprovalStatus.PENDING
                if matched_farm is not None:
                    # Present at one of the assigned farms → record that farm.
                    farm = matched_farm
                    attendance.farm = matched_farm
                    attendance.geofence_status = True
                    attendance.status = Attendance.Status.PRESENT
                else:
                    # Inside none of the farms. The out-of-farm case for a
                    # non-privileged worker was already blocked by the geofence
                    # gate above (before any record was created), so here we only
                    # reach: a privileged user off-site (record Absent) or no
                    # fence to verify against (None → Present, benefit of doubt).
                    farm = selected_farm
                    sel_inside = location_inside_farm(selected_farm, lat, lng) if selected_farm else None
                    attendance.geofence_status = sel_inside  # False or None
                    attendance.status = (
                        Attendance.Status.ABSENT if sel_inside is False
                        else Attendance.Status.PRESENT
                    )

                # Distance from the matched/selected farm centre for display.
                if farm and farm.latitude is not None and farm.longitude is not None:
                    distance = haversine_m(
                        float(farm.latitude), float(farm.longitude), lat, lng
                    )
                    attendance.check_in_distance = round(distance, 2)

                # ── Auto-detect address from GPS ───────────────────────────────
                try:
                    address = reverse_geocode(lat, lng)
                    if address:
                        attendance.check_in_address = address
                except Exception:
                    pass  # Ignore geocoding errors
            else:
                # No GPS coordinates provided
                attendance.geofence_status = None
                attendance.approval_status = Attendance.ApprovalStatus.PENDING

            attendance.save()
            return attendance

    @action(detail=True, methods=["post"])
    def check_out(self, request, pk=None):
        """Set check-out time and optional overtime.

        Also validates check-out GPS coordinates against the farm's geofence
        so the Geofence column reflects the check-out location status.
        Calculates working hours and overtime automatically.
        """
        with transaction.atomic():
            attendance = self.get_object()
            # Guard against checking out twice or before checking in.
            if attendance.check_in_time is None:
                return Response({"detail": "Cannot check out before checking in."}, status=400)
            if attendance.check_out_time is not None:
                return Response({"detail": "Already checked out today."}, status=400)
            attendance.check_out_time = timezone.now()
            # Hours actually worked this session (check-in → now), used for the
            # half-day rule below.
            worked_seconds_now = attendance.calculate_working_hours()
            FULL_DAY_MIN_SECONDS = Attendance.FULL_DAY_MIN_SECONDS
            # Auto-approve on check-out ONLY when the check-in was inside the
            # farm geofence. If the worker checked in from outside, keep them
            # Absent and unapproved (Approval column shows "-").
            if attendance.geofence_status is False:
                attendance.status = Attendance.Status.ABSENT
            else:
                # Monthly-wage employees: checking out with under 5 hours worked
                # counts as a HALF DAY (payroll cuts half a day's salary); 5+
                # hours is a full day. Hourly employees are paid by the hour, so
                # their day is left as a completed present day regardless.
                is_monthly = getattr(
                    attendance.employee, "wage_type", Employee.WageType.MONTHLY
                ) == Employee.WageType.MONTHLY
                if is_monthly and worked_seconds_now < FULL_DAY_MIN_SECONDS:
                    attendance.status = Attendance.Status.HALF_DAY
                else:
                    attendance.status = Attendance.Status.PRESENT_DONE
                attendance.approval_status = Attendance.ApprovalStatus.APPROVED
            if request.data.get("overtime_hours") is not None:
                attendance.overtime_hours = request.data.get("overtime_hours")
            if request.data.get("check_out_lat") is not None:
                attendance.check_out_lat = request.data.get("check_out_lat")
            if request.data.get("check_out_lng") is not None:
                attendance.check_out_lng = request.data.get("check_out_lng")
            check_out_photo = request.FILES.get("check_out_photo")
            if check_out_photo:
                attendance.check_out_photo = check_out_photo
            # Add check_out_notes
            if request.data.get("check_out_notes") is not None:
                attendance.check_out_notes = request.data.get("check_out_notes")

            # Calculate check-out location and detect address
            out_lat = request.data.get("check_out_lat")
            out_lng = request.data.get("check_out_lng")
            if out_lat is not None and out_lng is not None:
                out_lat, out_lng = float(out_lat), float(out_lng)
                farm = attendance.farm or attendance.employee.farm

                # Calculate distance from farm centre for display
                if farm.latitude is not None and farm.longitude is not None:
                    distance = haversine_m(
                        float(farm.latitude), float(farm.longitude),
                        out_lat, out_lng
                    )
                    attendance.check_out_distance = round(distance, 2)

                # Check geofence status at check-out location
                is_inside_out = location_inside_farm(farm, out_lat, out_lng)
                if is_inside_out is True:
                    attendance.check_out_geofence_status = True
                elif is_inside_out is False:
                    attendance.check_out_geofence_status = False

                # Auto-detect address from GPS
                try:
                    address = reverse_geocode(out_lat, out_lng)
                    if address:
                        attendance.check_out_address = address
                except Exception:
                    pass  # Ignore geocoding errors

            # ── Calculate Working Hours ─────────────────────────────────────
            # Calculate total working seconds
            working_seconds = attendance.calculate_working_hours()
            attendance.working_seconds = working_seconds

            # Calculate overtime (beyond 8 hours = 28800 seconds)
            overtime_seconds = attendance.calculate_overtime(regular_hours=8)
            attendance.overtime_seconds = overtime_seconds

            # Convert overtime to hours for the existing field
            if overtime_seconds > 0:
                attendance.overtime_hours = round(overtime_seconds / 3600, 2)

            attendance.save()

            serializer = self.get_serializer(attendance, context={'request': request})
            return Response(serializer.data, status=200)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Approve an attendance record."""
        if request.user.role == Role.EMPLOYEE:
            return Response({"detail": "Not authorized to approve attendance."}, status=403)
        attendance = self.get_object()
        attendance.approval_status = Attendance.ApprovalStatus.APPROVED
        attendance.approved_by = request.user
        attendance.save()

        serializer = self.get_serializer(attendance, context={'request': request})
        return Response(serializer.data, status=200)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """Reject an attendance record."""
        if request.user.role == Role.EMPLOYEE:
            return Response({"detail": "Not authorized to reject attendance."}, status=403)
        attendance = self.get_object()
        attendance.approval_status = Attendance.ApprovalStatus.REJECTED
        attendance.approved_by = request.user
        if request.data.get("remarks"):
            attendance.remarks = request.data.get("remarks")
        attendance.save()

        serializer = self.get_serializer(attendance, context={'request': request})
        return Response(serializer.data, status=200)

    def _reportable_employees(self):
        """The employees this user may see on Attendance Reports.

        Deliberately the same rule as ``EmployeeViewSet.get_queryset``: the
        report must list exactly the people the Employees page lists, no more.
        Each super admin runs their own farm (see
        ``accounts.views.register_super_admin``) and no role is in
        ``TENANT_GLOBAL_ROLES``, so farm membership is the tenant boundary for
        every caller — the main super admin included.

        Super admins themselves are excluded on both sides of the link (the
        category can also be set by hand): their Employee record only exists to
        carry the login, so they have no attendance and appeared as permanently
        "absent" rows. Managers stay listed — they do mark attendance.

        Shared by ``report`` and ``report_override`` so the list you can read
        and the rows you can edit can never drift apart.
        """
        user = self.request.user
        if user.role == Role.EMPLOYEE:
            employees = Employee.objects.select_related("farm").filter(user=user)
        else:
            farm_ids = list(user.farms.values_list("id", flat=True))
            employees = (
                Employee.objects.select_related("farm").filter(farm_id__in=farm_ids)
                if farm_ids
                else Employee.objects.none()
            )
        return employees.exclude(user__role=Role.SUPER_ADMIN).exclude(
            category=Employee.Category.SUPER_ADMIN
        )

    @action(detail=False, methods=["get"])
    def report(self, request):
        """Attendance summary per employee for a month/year (optionally one farm).

        Includes ALL employees (not just those with Attendance records).
        Days without any attendance record are counted as Absent.
        """
        farm = request.query_params.get("farm")
        employee = request.query_params.get("employee")
        month = request.query_params.get("month")
        year = request.query_params.get("year")

        # Validate numeric params up front so a bad ?year=abc / ?month=xx
        # returns 400 instead of raising ValueError → 500.
        try:
            month = int(month) if month else None
            if month is not None and not (1 <= month <= 12):
                raise ValueError
        except (TypeError, ValueError):
            return Response({"detail": "month must be an integer 1-12."}, status=400)
        try:
            year = int(year) if year else None
        except (TypeError, ValueError):
            return Response({"detail": "year must be an integer."}, status=400)

        employees = self._reportable_employees()
        if farm:
            employees = employees.filter(farm_id=farm)
        if employee:
            employees = employees.filter(id=employee)

        today = timezone.localdate()
        if not year:
            year = today.year

        # Every month counts its FULL calendar length (28-31, leap-aware), so
        # Absent = month days − present − half − leave. This matches the
        # Attendance Reports "Edit" modal exactly. Summed over all 12 months an
        # All-Months report therefore totals 365 days (366 in a leap year); a
        # single selected month totals that month's own day count.
        def days_countable(m):
            return monthrange(year, m)[1]

        # Raw attendance for the span, grouped per (employee, month).
        att_qs = Attendance.objects.filter(date__year=year)
        if month:
            att_qs = att_qs.filter(date__month=month)
        if farm:
            att_qs = att_qs.filter(farm_id=farm)
        if employee:
            att_qs = att_qs.filter(employee_id=employee)

        raw = {}  # raw[employee_id][month] = {present, half_day, absent, leave, overtime_hours}
        for att in att_qs.select_related("employee", "employee__farm"):
            per_month = raw.setdefault(att.employee_id, {})
            rec = per_month.setdefault(
                att.date.month,
                {"present": 0, "half_day": 0, "absent": 0, "leave": 0, "overtime_hours": 0.0},
            )
            rec["overtime_hours"] += float(att.overtime_hours or 0)
            if att.status in (Attendance.Status.PRESENT, Attendance.Status.PRESENT_DONE):
                rec["present"] += 1
            elif att.status == Attendance.Status.HALF_DAY:
                rec["half_day"] += 1
            elif att.status == Attendance.Status.ABSENT:
                rec["absent"] += 1
            elif att.status == Attendance.Status.LEAVE:
                rec["leave"] += 1

        # Manual per-employee overrides (Attendance Reports "Edit"). A per-month
        # override replaces that month's computed totals; a whole-year override
        # (month is NULL) replaces the entire All-Months aggregate.
        ov_month = {}  # ov_month[employee_id][month] = summary row
        ov_year = {}   # ov_year[employee_id] = whole-year summary row
        for o in AttendanceMonthlySummary.objects.filter(employee__in=employees, year=year):
            if o.month is None:
                ov_year[o.employee_id] = o
            elif not month or o.month == month:
                ov_month.setdefault(o.employee_id, {})[o.month] = o

        def as_summary(ov):
            return {
                "present": ov.present,
                "half_day": ov.half_day,
                "absent": ov.absent,
                "leave": ov.leave,
                "overtime_hours": float(ov.overtime_hours or 0),
            }

        rows = []
        for emp in employees:
            emp_raw = raw.get(emp.id, {})
            emp_ov = ov_month.get(emp.id, {})

            agg = {"present": 0, "half_day": 0, "absent": 0, "leave": 0, "overtime_hours": 0.0}
            overridden = False

            if not month and emp.id in ov_year:
                # A whole-year manual override wins over everything.
                agg = as_summary(ov_year[emp.id])
                overridden = True
            else:
                # Months to sum:
                #  • single month → just that month (a no-show employee therefore
                #    appears as a full month Absent).
                #  • All Months → every month of the year, so the totals span the
                #    whole year (365 days, 366 in a leap year); months with no
                #    attendance simply count as fully Absent.
                months = [month] if month else list(range(1, 13))
                for m in months:
                    if m in emp_ov:
                        s = as_summary(emp_ov[m])
                        overridden = True
                    else:
                        td = days_countable(m)
                        rec = emp_raw.get(m)
                        if rec:
                            accounted = rec["present"] + rec["half_day"] + rec["leave"] + rec["absent"]
                            s = {
                                "present": rec["present"],
                                "half_day": rec["half_day"],
                                "leave": rec["leave"],
                                "absent": rec["absent"] + max(0, td - accounted),
                                "overtime_hours": rec["overtime_hours"],
                            }
                        else:
                            s = {"present": 0, "half_day": 0, "leave": 0, "absent": td, "overtime_hours": 0.0}
                    for k in agg:
                        agg[k] += s[k]

            total = agg["present"] + agg["half_day"] + agg["leave"] + agg["absent"]
            effective = agg["present"] + 0.5 * agg["half_day"]
            rows.append({
                # The id is what the UI acts on (edit / delete). Without it the
                # client had to reverse-map the display name back to an employee
                # through a separate, differently-scoped list endpoint — which
                # silently failed for every row that list didn't happen to
                # contain, and could hit the wrong person on duplicate names.
                "employee_id": str(emp.id),
                "employee": emp.name,
                "farm_name": emp.farm.name if emp.farm else "",
                "present": agg["present"],
                "half_day": agg["half_day"],
                "absent": agg["absent"],
                "leave": agg["leave"],
                "overtime_hours": agg["overtime_hours"],
                "marked": total,
                "overridden": overridden,
                "attendance_pct": round(100 * effective / total, 1) if total else 0,
            })

        rows.sort(key=lambda r: r["employee"])
        return Response({"count": len(rows), "rows": rows})

    @action(detail=False, methods=["post"], url_path="report_override")
    def report_override(self, request):
        """Save admin-edited monthly totals for one employee.

        Powers the Attendance Reports "Edit" action: stores Present / Half-Day /
        Absent / Leave / OT-hours as a manual override that `report` then shows
        instead of the computed values, for that (employee, year, month).
        """
        if request.user.role == Role.EMPLOYEE:
            return Response({"detail": "Not allowed."}, status=403)

        data = request.data
        employee_id = data.get("employee")
        if not employee_id:
            return Response({"detail": "employee is required."}, status=400)
        try:
            year = int(data.get("year"))
        except (TypeError, ValueError):
            return Response({"detail": "year is required (integer)."}, status=400)
        month = data.get("month")
        try:
            month = int(month) if month not in (None, "", "null") else None
            if month is not None and not (1 <= month <= 12):
                raise ValueError
        except (TypeError, ValueError):
            return Response({"detail": "month must be an integer 1-12."}, status=400)

        # Look the employee up through the same scope the report uses, not
        # Employee.objects — an unscoped get() here let any admin or manager
        # overwrite another tenant's monthly totals (and rebuild their payslip)
        # by posting a raw employee id, for a row they cannot even see.
        try:
            emp = self._reportable_employees().get(id=employee_id)
        except (Employee.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "employee not found."}, status=404)

        def _int(v):
            try:
                return max(0, int(float(v)))
            except (TypeError, ValueError):
                return 0

        def _dec(v):
            try:
                return max(0.0, float(v))
            except (TypeError, ValueError):
                return 0.0

        AttendanceMonthlySummary.objects.update_or_create(
            employee=emp,
            year=year,
            month=month,
            defaults={
                "present": _int(data.get("present")),
                "half_day": _int(data.get("half_day")),
                "absent": _int(data.get("absent")),
                "leave": _int(data.get("leave")),
                "overtime_hours": _dec(data.get("overtime_hours")),
                "created_by": request.user,
            },
        )

        # Salary follows attendance: rebuild this employee's payslip for the
        # edited month so the new Present/Half-Day flows into the days worked and
        # the gross/net pay on the Payslips page right away — creating the payslip
        # if it doesn't exist yet. Never fail the attendance save if the payroll
        # sync hits a problem.
        if month:
            try:
                from apps.payroll.views import _resync_payslip_from_attendance

                _resync_payslip_from_attendance(emp, month, year, user=request.user)
            except Exception:
                pass

        return Response({"status": "ok"})

    @action(detail=False, methods=["post"])
    def mark_absent(self, request):
        """Mark all employees without attendance for a given date as ABSENT.

        This should be run at end of day to mark employees who didn't check in as Absent.
        Only creates ABSENT records for employees who have NO attendance for the date.
        """
        if request.user.role not in (Role.SUPER_ADMIN, Role.FARM_MANAGER):
            return Response({"detail": "Not authorized."}, status=403)

        target_date = request.data.get("date")
        if target_date:
            from django.utils.dateparse import parse_date
            target_date = parse_date(target_date)
        else:
            target_date = timezone.localdate()

        if not target_date:
            return Response({"detail": "Invalid date."}, status=400)

        # The employees this caller may mark — the same set the Employees page
        # and the attendance report show. This used to take every Employee in
        # the database for a SUPER_ADMIN, so one tenant pressing "Mark Absent"
        # wrote APPROVED absent rows across every other tenant's workforce, and
        # those rows then fed their payslips through _attendance_worked_days.
        employees = self._reportable_employees()

        marked_count = 0
        for employee in employees:
            # Check if attendance exists for this date
            existing = Attendance.objects.filter(employee=employee, date=target_date).first()
            if not existing:
                # Create absent attendance record
                Attendance.objects.create(
                    employee=employee,
                    farm=employee.farm,
                    date=target_date,
                    status=Attendance.Status.ABSENT,
                    approval_status=Attendance.ApprovalStatus.APPROVED,
                    created_by=request.user,
                )
                marked_count += 1

        return Response({
            "date": str(target_date),
            "marked_absent": marked_count,
            "message": f"Marked {marked_count} employees as absent for {target_date}"
        })

    @action(detail=False, methods=["get"])
    def today_status(self, request):
        """Get today's attendance status for a specific employee.

        Returns attendance record only if it exists (no auto-creation),
        used by frontend to show current status card.
        """
        employee_id = request.query_params.get("employee")
        if not employee_id:
            return Response({"detail": "employee parameter required."}, status=400)

        today = timezone.localdate()
        # Scoped: ?employee= comes straight from the client, and an unscoped
        # lookup returned the full serialized attendance — GPS coordinates,
        # addresses, check-in/out photos, farm — for any employee in any tenant.
        attendance = self.get_queryset().filter(
            employee_id=employee_id,
            date=today
        ).select_related("employee", "farm").first()

        if not attendance:
            return Response({"has_attendance": False})

        serializer = self.get_serializer(attendance, context={'request': request})
        data = serializer.data
        data["has_attendance"] = True
        return Response(data)


class TenantOwnedRefMixin(FarmScopedQuerysetMixin):
    """Farm scoping for the reference tables that gained a farm in 0016.

    Departments and Skills had no owner column at all, so the tables were global
    and every tenant listed and could edit every other tenant's rows. They are
    now scoped like everything else, and new rows are stamped with the creator's
    farm so they are owned from birth.

    Rows that migration 0017 could not attribute — nobody is in the department /
    tagged with the skill — keep a NULL farm and stay visible to everyone. That
    is a deliberate compromise, not an oversight: on production 4 of 5
    departments and the only skill have no employees and no recoverable creator
    (the audit trail records the collection URL, not the object id), so scoping
    them strictly would empty the Departments and Skills pages and the employee
    form dropdowns. They expose nothing but a name.

    Everything created from here on is stamped with its farm and is private, so
    the shared remainder only shrinks.
    """

    def get_queryset(self):
        qs = super().get_queryset()
        unattributed = self.queryset.model.objects.filter(farm__isnull=True)
        return (qs | unattributed).distinct()

    def perform_create(self, serializer):
        farm = serializer.validated_data.get("farm") or self.request.user.farms.first()
        serializer.save(farm=farm)


class DepartmentViewSet(TenantOwnedRefMixin, BaseModelViewSet):
    queryset = Department.objects.prefetch_related("employees").all()
    serializer_class = DepartmentSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    search_fields = ["name", "code", "description"]


class SkillViewSet(TenantOwnedRefMixin, BaseModelViewSet):
    queryset = Skill.objects.prefetch_related("employees").all()
    serializer_class = SkillSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["category"]
    search_fields = ["name", "category"]


class EmploymentHistoryViewSet(EmployeeSelfScopedMixin, FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = EmploymentHistory.objects.select_related(
        "employee", "employee__farm", "department"
    ).all()
    serializer_class = EmploymentHistorySerializer
    farm_lookup = "employee__farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["employee", "event_type", "department"]
    search_fields = ["designation", "notes"]

    @action(detail=False, methods=["delete"])
    def remove_all(self, request):
        """Delete all employment history records."""
        count, _ = self.get_queryset().delete()
        return Response({"deleted": count})


class PerformanceReviewViewSet(EmployeeSelfScopedMixin, FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = PerformanceReview.objects.select_related(
        "employee", "employee__farm", "reviewer"
    ).all()
    serializer_class = PerformanceReviewSerializer
    farm_lookup = "employee__farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["employee", "rating"]
    search_fields = ["remarks", "strengths", "improvements"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, reviewer=self.request.user)


class AvailabilityViewSet(EmployeeSelfScopedMixin, FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = Availability.objects.select_related("employee", "employee__farm").all()
    serializer_class = AvailabilitySerializer
    farm_lookup = "employee__farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["employee", "status"]
    search_fields = ["reason"]
