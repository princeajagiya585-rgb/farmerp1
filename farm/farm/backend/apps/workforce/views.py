from calendar import monthrange
from datetime import date

from django.db.models import Count, Q
from django.utils import timezone

from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.mixins import BaseModelViewSet, EmployeeSelfScopedMixin
from apps.accounts.models import Role
from apps.farms.views import FarmScopedQuerysetMixin

# ── Cross-app imports for GPS location logging ──────────────────────────
from apps.gps.models import FieldActivity, LocationPing
from apps.gps.utils import broadcast_field_activity, broadcast_ping
from apps.tasks.models import Task


def _resolve_task(request):
    """Return the Task selected on a check-in/during-work/check-out submit,
    or None. Safe against missing/invalid ids."""
    tid = request.data.get("task")
    if not tid:
        return None
    return Task.objects.filter(id=tid).first()

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
        """Return all employees. For EMPLOYEE role, only show their own record.
        Other roles see all employees (with or without linked user)."""
        qs = super().get_queryset()
        # EMPLOYEE role can only see their own profile
        if self.request.user.role == Role.EMPLOYEE:
            qs = qs.filter(user=self.request.user)
        # Other roles see all employees (including those without linked user)
        return qs
    farm_lookup = "farm_id"
    employee_self_lookup = "user"  # Employee links directly to the user
    allowed_roles = [Role.FARM_MANAGER, Role.EMPLOYEE]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["farm", "category", "employment_type", "is_active", "department"]
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
        """Create or update today's attendance with check-in details.

        Also creates a LocationPing so the check-in appears on the GPS
        Location Map ("Your Location History") and live tracking map.
        """
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

    def _do_check_in(self, employee, request):
        """Shared check-in logic used by both `check_in` and `check_in_by_code`."""
        today = timezone.localdate()
        attendance, _created = Attendance.objects.get_or_create(
            employee=employee,
            date=today,
            defaults={"farm": employee.farm, "created_by": request.user},
        )
        # Don't silently overwrite an existing check-in for today.
        if not _created and attendance.check_in_time is not None:
            return attendance

        attendance.check_in_time = timezone.now()
        attendance.status = request.data.get("status", Attendance.Status.PRESENT)
        if request.data.get("check_in_lat") is not None:
            attendance.check_in_lat = request.data.get("check_in_lat")
        if request.data.get("check_in_lng") is not None:
            attendance.check_in_lng = request.data.get("check_in_lng")
        check_in_photo = request.FILES.get("check_in_photo")
        if check_in_photo:
            attendance.check_in_photo = check_in_photo
        attendance.save()

        # ── Create a LocationPing so the check-in appears on the GPS map ──
        task = _resolve_task(request)
        if request.data.get("check_in_lat") is not None and request.data.get("check_in_lng") is not None:
            ping_user = employee.user or request.user
            ping = LocationPing.objects.create(
                user=ping_user,
                created_by=request.user,
                farm=attendance.farm,
                latitude=request.data["check_in_lat"],
                longitude=request.data["check_in_lng"],
                activity=LocationPing.Activity.CHECKIN,
                recorded_at=attendance.check_in_time,
                task=task,
                photo=check_in_photo if check_in_photo else None
            )
            broadcast_ping(ping, request=request)

        # ── Create a FieldActivity so check-in shows on admin's Field Activities page ──
        # Avoid duplicates: only create if no FieldActivity for this user exists today
        fa_user = employee.user or request.user
        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        existing_activity = FieldActivity.objects.filter(
            user=fa_user,
            recorded_at__gte=today_start,
        ).first()
        if not existing_activity and request.data.get("check_in_lat") is not None:
            fa = FieldActivity.objects.create(
                user=fa_user,
                created_by=request.user,
                farm=attendance.farm,
                task=task,
                description="Checked in for work",
                latitude=request.data.get("check_in_lat"),
                longitude=request.data.get("check_in_lng"),
                photo=check_in_photo if check_in_photo else None,
                status=FieldActivity.Status.SUBMITTED,
                recorded_at=attendance.check_in_time,
            )
            broadcast_field_activity(fa, request=request)

        return attendance

    @action(detail=True, methods=["post"])
    def check_out(self, request, pk=None):
        """Set check-out time and optional overtime.

        Also creates a LocationPing so the check-out appears on the GPS
        Location Map and live tracking map.
        """
        attendance = self.get_object()
        # Guard against checking out twice or before checking in.
        if attendance.check_in_time is None:
            return Response({"detail": "Cannot check out before checking in."}, status=400)
        if attendance.check_out_time is not None:
            return Response({"detail": "Already checked out today."}, status=400)
        attendance.check_out_time = timezone.now()
        if request.data.get("overtime_hours") is not None:
            attendance.overtime_hours = request.data.get("overtime_hours")
        if request.data.get("check_out_lat") is not None:
            attendance.check_out_lat = request.data.get("check_out_lat")
        if request.data.get("check_out_lng") is not None:
            attendance.check_out_lng = request.data.get("check_out_lng")
        check_out_photo = request.FILES.get("check_out_photo")
        if check_out_photo:
            attendance.check_out_photo = check_out_photo
        attendance.save()

        # ── Create a LocationPing so the check-out appears on the GPS map ──
        task = _resolve_task(request)
        if request.data.get("check_out_lat") is not None and request.data.get("check_out_lng") is not None:
            # Use the employee's linked user if available (important when a
            # manager checks out on behalf of a worker)
            ping_user = attendance.employee.user or request.user
            ping = LocationPing.objects.create(
                user=ping_user,
                created_by=request.user,
                farm=attendance.farm,
                latitude=request.data["check_out_lat"],
                longitude=request.data["check_out_lng"],
                activity=LocationPing.Activity.CHECKOUT,
                recorded_at=attendance.check_out_time,
                task=task,
                photo=check_out_photo if check_out_photo else None
            )
            broadcast_ping(ping, request=request)

        serializer = self.get_serializer(attendance, context={'request': request})
        return Response(serializer.data, status=200)

    @action(detail=False, methods=["post"])
    def during_work(self, request):
        """Record a during-work ping (photo + location) for today's attendance.

        Also creates a LocationPing with DURING_WORK activity so it appears
        on the GPS map, and a FieldActivity for admin verification.
        Returns the attendance record with full data.
        """
        employee_id = request.data.get("employee")
        if not employee_id:
            return Response({"detail": "employee is required."}, status=400)

        employee = Employee.objects.filter(pk=employee_id).first()
        if not employee:
            return Response({"detail": "Employee not found."}, status=404)

        # An employee may only post during-work for themselves.
        if request.user.role == Role.EMPLOYEE and employee.user_id != request.user.pk:
            return Response({"detail": "You may only update your own work."}, status=403)

        today = timezone.localdate()
        attendance, _created = Attendance.objects.get_or_create(
            employee=employee,
            date=today,
            defaults={"farm": employee.farm, "created_by": request.user},
        )

        lat = request.data.get("latitude")
        lng = request.data.get("longitude")
        during_work_photo = request.FILES.get("photo")
        now = timezone.now()

        # ── Create LocationPing with DURING_WORK activity ──
        task = _resolve_task(request)
        if lat is not None and lng is not None:
            ping_user = employee.user or request.user
            ping = LocationPing.objects.create(
                user=ping_user,
                created_by=request.user,
                farm=attendance.farm,
                latitude=lat,
                longitude=lng,
                activity=LocationPing.Activity.DURING_WORK,
                recorded_at=now,
                task=task,
                photo=during_work_photo if during_work_photo else None,
            )
            broadcast_ping(ping, request=request)

        # ── Create/update FieldActivity for admin verification ──
        if lat is not None and lng is not None:
            fa_user = employee.user or request.user
            fa = FieldActivity.objects.create(
                user=fa_user,
                created_by=request.user,
                farm=attendance.farm,
                task=task,
                description="During work photo update",
                latitude=lat,
                longitude=lng,
                photo=during_work_photo if during_work_photo else None,
                status=FieldActivity.Status.SUBMITTED,
                recorded_at=now,
            )
            broadcast_field_activity(fa, request=request)

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
            employees = Employee.objects.filter(user=user)
        elif user.role == Role.SUPER_ADMIN:
            employees = Employee.objects.all()
        else:
            farm_ids = list(user.farms.values_list("id", flat=True))
            employees = Employee.objects.filter(farm_id__in=farm_ids) if farm_ids else Employee.objects.none()
        if farm:
            employees = employees.filter(farm_id=farm)

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
        if month:
            att_qs = att_qs.filter(date__month=month)
        if year:
            att_qs = att_qs.filter(date__year=year)

        # Build per-employee summary from actual records
        summary = {}
        for att in att_qs.select_related("employee"):
            row = summary.setdefault(
                att.employee_id,
                {
                    "present": 0,
                    "half_day": 0,
                    "absent": 0,
                    "leave": 0,
                    "overtime_hours": 0,
                    "marked": 0,
                },
            )
            row["marked"] += 1
            row["overtime_hours"] += float(att.overtime_hours or 0)
            if att.status == Attendance.Status.PRESENT:
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
                }
            row["employee"] = emp.name
            effective = row["present"] + 0.5 * row["half_day"]
            row["attendance_pct"] = (
                round(100 * effective / row["marked"], 1) if row["marked"] else 0
            )
            rows.append(row)

        rows.sort(key=lambda r: r["employee"])
        return Response({"count": len(rows), "rows": rows})


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
