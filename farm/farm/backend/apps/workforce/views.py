from calendar import monthrange
from datetime import date, datetime, timedelta

from django.db.models import Count, Q
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.mixins import BaseModelViewSet, EmployeeSelfScopedMixin
from apps.accounts.models import Role
from apps.farms.views import FarmScopedQuerysetMixin
from apps.gps.utils import haversine_m, location_inside_farm, reverse_geocode

from .models import (
    Employee,
    Shift,
    WorkforceAllocation,
    Attendance,
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
        return qs
    farm_lookup = "farm_id"
    employee_self_lookup = "user"  # Employee links directly to the user
    allowed_roles = [Role.FARM_MANAGER, Role.EMPLOYEE]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["farm", "category", "employment_type", "is_active", "department", "user"]
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



    @action(detail=False, methods=["post"])
    def check_in(self, request):
        """Create or update today's attendance with check-in details."""
        employee_id = request.data.get("employee")
        if not employee_id:
            return Response({"detail": "employee is required."}, status=400)

        employee = Employee.objects.filter(pk=employee_id).first()
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

        employee = Employee.objects.filter(employee_code=code).first()
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

            # Check if attendance already exists for this date
            existing = Attendance.objects.filter(employee=employee, date=att_date).first()
            if existing and existing.check_in_time is not None:
                # Already checked in - return existing record
                return existing

            # Create or get attendance record
            if existing:
                attendance = existing
                attendance.farm = employee.farm
                attendance.created_by = request.user
            else:
                attendance = Attendance.objects.create(
                    employee=employee,
                    farm=employee.farm,
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
                farm = employee.farm

                # Calculate distance from farm centre for display
                if farm.latitude is not None and farm.longitude is not None:
                    distance = haversine_m(
                        float(farm.latitude), float(farm.longitude), lat, lng
                    )
                    attendance.check_in_distance = round(distance, 2)

                # Use location_inside_farm for accurate geofence validation
                # Checks Geofence model polygons, center+radius, farm polygon, then farm center+radius
                is_inside = location_inside_farm(farm, lat, lng)
                if is_inside is True:
                    attendance.geofence_status = True
                    attendance.approval_status = Attendance.ApprovalStatus.APPROVED
                elif is_inside is False:
                    attendance.geofence_status = False
                    attendance.approval_status = Attendance.ApprovalStatus.FAILED
                else:
                    # None means no fence config — cannot determine status
                    attendance.geofence_status = None
                    attendance.approval_status = Attendance.ApprovalStatus.PENDING

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
            attendance.status = Attendance.Status.PRESENT_DONE
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
                farm = attendance.employee.farm

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

        # All employees on farms the user can access (optionally filtered by farm)
        user = self.request.user
        if user.role == Role.EMPLOYEE:
            employees = Employee.objects.select_related("farm").filter(user=user)
        elif user.role == Role.SUPER_ADMIN:
            employees = Employee.objects.select_related("farm").all()
        else:
            farm_ids = list(user.farms.values_list("id", flat=True))
            employees = Employee.objects.select_related("farm").filter(farm_id__in=farm_ids) if farm_ids else Employee.objects.none()
        if farm:
            employees = employees.filter(farm_id=farm)
        if employee:
            employees = employees.filter(id=employee)

        # Calculate total days in the selected period
        today = timezone.localdate()
        if year:
            y = int(year)
            if month:
                _, total_days = monthrange(y, int(month))
            else:
                if y == today.year:
                    # Days elapsed in the current year so far
                    total_days = (today - date(y, 1, 1)).days + 1
                else:
                    # Full year (leap year check)
                    total_days = 366 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 365
        else:
            # No year specified — default to current month
            _, total_days = monthrange(today.year, today.month)

        # Get attendance records for the period
        att_qs = Attendance.objects.all()
        if farm:
            att_qs = att_qs.filter(farm_id=farm)
        if employee:
            att_qs = att_qs.filter(employee_id=employee)
        if month:
            att_qs = att_qs.filter(date__month=month)
        if year:
            att_qs = att_qs.filter(date__year=year)

        # Build per-employee summary from actual records
        summary = {}
        for att in att_qs.select_related("employee", "employee__farm"):
            row = summary.setdefault(
                att.employee_id,
                {
                    "present": 0,
                    "half_day": 0,
                    "absent": 0,
                    "leave": 0,
                    "overtime_hours": 0,
                    "marked": 0,
                    "farm_name": att.employee.farm.name if att.employee.farm else "",
                },
            )
            row["marked"] += 1
            row["overtime_hours"] += float(att.overtime_hours or 0)
            if att.status == Attendance.Status.PRESENT or att.status == Attendance.Status.PRESENT_DONE:
                row["present"] += 1
            elif att.status == Attendance.Status.HALF_DAY:
                row["half_day"] += 1
            elif att.status == Attendance.Status.ABSENT:
                row["absent"] += 1
            elif att.status == Attendance.Status.LEAVE:
                row["leave"] += 1

        # Build final rows — include ALL employees, fill missing days as Absent
        rows = []
        for emp in employees:
            row = summary.get(emp.id)
            if row:
                accounted = row["present"] + row["half_day"] + row["leave"] + row["absent"]
                unmarked = max(0, total_days - accounted)
                row["absent"] += unmarked
                row["marked"] = total_days
            else:
                row = {
                    "present": 0,
                    "half_day": 0,
                    "absent": total_days,
                    "leave": 0,
                    "overtime_hours": 0,
                    "marked": total_days,
                    "farm_name": emp.farm.name if emp.farm else "",
                }
            row["employee"] = emp.name
            # Ensure farm_name is always set
            if "farm_name" not in row:
                row["farm_name"] = emp.farm.name if emp.farm else ""
            effective = row["present"] + 0.5 * row["half_day"]
            row["attendance_pct"] = (
                round(100 * effective / row["marked"], 1) if row["marked"] else 0
            )
            rows.append(row)

        rows.sort(key=lambda r: r["employee"])
        return Response({"count": len(rows), "rows": rows})

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

        # Get all employees
        user = request.user
        if user.role == Role.SUPER_ADMIN:
            employees = Employee.objects.select_related("farm").all()
        else:
            farm_ids = list(user.farms.values_list("id", flat=True))
            employees = Employee.objects.select_related("farm").filter(farm_id__in=farm_ids) if farm_ids else Employee.objects.none()

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
        attendance = Attendance.objects.filter(
            employee_id=employee_id,
            date=today
        ).select_related("employee", "farm").first()

        if not attendance:
            return Response({"has_attendance": False})

        serializer = self.get_serializer(attendance, context={'request': request})
        data = serializer.data
        data["has_attendance"] = True
        return Response(data)


class DepartmentViewSet(BaseModelViewSet):
    queryset = Department.objects.prefetch_related("employees").all()
    serializer_class = DepartmentSerializer
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    search_fields = ["name", "code", "description"]


class SkillViewSet(BaseModelViewSet):
    queryset = Skill.objects.prefetch_related("employees").all()
    serializer_class = SkillSerializer
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
