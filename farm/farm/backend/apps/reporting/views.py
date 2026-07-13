from django.db.models import Count, ExpressionWrapper, F, DurationField, Q, Sum
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role
from apps.core.permissions import IsManagerOrAdmin
from apps.agronomy.models import Crop, HarvestRecord
from apps.farms.models import Farm
from apps.finance.models import Expense, RevenueEntry
from apps.gps.models import LocationPing
from apps.inventory.models import Item
from apps.payroll.models import Advance, Deduction, Incentive, Payment
from apps.tasks.models import Task, TaskWorkSession
from apps.workforce.models import Attendance, Employee

GLOBAL_ROLES = {Role.SUPER_ADMIN}


def get_accessible_farm_ids(user):
    """Return the list of farm ids the user can report on."""
    if user.role in GLOBAL_ROLES:
        return list(Farm.objects.values_list("id", flat=True))
    return list(user.farms.values_list("id", flat=True))


class DashboardView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = serializers.Serializer

    def get(self, request):
        farm_ids = get_accessible_farm_ids(request.user)
        today = timezone.now().date()

        farms_qs = Farm.objects.filter(id__in=farm_ids)
        total_farms = farms_qs.count()
        total_area = farms_qs.aggregate(s=Sum("total_area"))["s"] or 0
        total_fields = farms_qs.aggregate(c=Count("fields"))["c"] or 0

        emp_qs = Employee.objects.filter(farm_id__in=farm_ids)
        att_qs = Attendance.objects.filter(farm_id__in=farm_ids)
        present_today = att_qs.filter(
            date=today,
            status__in=[Attendance.Status.PRESENT, Attendance.Status.PRESENT_DONE],
        ).count()
        absent_today = att_qs.filter(
            date=today, status=Attendance.Status.ABSENT
        ).count()
        pending_approvals = att_qs.filter(
            approval_status=Attendance.ApprovalStatus.PENDING
        ).count()
        # Users currently on the clock: checked in today but not yet checked out.
        # This drops by one as soon as someone checks out.
        checked_in_now = att_qs.filter(
            date=today,
            check_in_time__isnull=False,
            check_out_time__isnull=True,
        ).count()
        manager_count = emp_qs.filter(category="MANAGER").count()

        crop_qs = Crop.objects.filter(farm_id__in=farm_ids)
        active_crops = crop_qs.filter(
            status__in=[Crop.Status.PLANNED, Crop.Status.PLANTED, Crop.Status.GROWING]
        ).count()
        total_harvest_qty = (
            HarvestRecord.objects.filter(farm_id__in=farm_ids).aggregate(
                s=Sum("quantity")
            )["s"]
            or 0
        )

        total_expenses = (
            Expense.objects.filter(
                farm_id__in=farm_ids, status=Expense.Status.APPROVED
            ).aggregate(s=Sum("amount"))["s"]
            or 0
        )
        total_revenue = (
            RevenueEntry.objects.filter(farm_id__in=farm_ids).aggregate(
                s=Sum("amount")
            )["s"]
            or 0
        )

        # Per-farm Expenses / Revenue / Net for the Financial Management box.
        # Two grouped aggregations merged in Python (avoids a JOIN that would
        # multiply the sums together).
        _exp_by_farm = dict(
            Expense.objects.filter(
                farm_id__in=farm_ids, status=Expense.Status.APPROVED
            )
            .values("farm_id")
            .annotate(s=Sum("amount"))
            .values_list("farm_id", "s")
        )
        _rev_by_farm = dict(
            RevenueEntry.objects.filter(farm_id__in=farm_ids)
            .values("farm_id")
            .annotate(s=Sum("amount"))
            .values_list("farm_id", "s")
        )
        financial_breakdown = [
            {
                "farm_id": str(farm.id),
                "farm_name": farm.name,
                "expenses": _exp_by_farm.get(farm.id) or 0,
                "revenue": _rev_by_farm.get(farm.id) or 0,
                "net": (_rev_by_farm.get(farm.id) or 0) - (_exp_by_farm.get(farm.id) or 0),
            }
            for farm in farms_qs
        ]

        # Payroll extras
        total_advances = (
            Advance.objects.filter(farm_id__in=farm_ids).aggregate(s=Sum("amount"))["s"] or 0
        )
        outstanding_advances = (
            Advance.objects.filter(farm_id__in=farm_ids, status=Advance.Status.OUTSTANDING)
            .aggregate(s=Sum("amount"))["s"] or 0
        )
        total_deductions = (
            Deduction.objects.filter(farm_id__in=farm_ids).aggregate(s=Sum("amount"))["s"] or 0
        )
        total_incentives = (
            Incentive.objects.filter(farm_id__in=farm_ids).aggregate(s=Sum("amount"))["s"] or 0
        )
        total_payments = (
            Payment.objects.filter(employee__farm_id__in=farm_ids).aggregate(s=Sum("amount"))["s"] or 0
        )

        # Inventory summary
        items_qs = Item.objects.filter(farm_id__in=farm_ids)
        low_stock_count = sum(1 for i in items_qs if i.is_low_stock)
        stock_value = sum(i.stock_value for i in items_qs)

        # For EMPLOYEE role, scope task data to only the current user
        user = request.user
        is_employee = user.role == Role.EMPLOYEE

        task_qs = Task.objects.filter(farm_id__in=farm_ids)
        if is_employee:
            task_qs = task_qs.filter(assigned_to=user)

        open_tasks = task_qs.filter(
            status__in=[Task.Status.TODO, Task.Status.IN_PROGRESS]
        ).count()
        completed_tasks = task_qs.filter(status=Task.Status.COMPLETED).count()

        now = timezone.now()
        cutoff_12h = now - timezone.timedelta(hours=12)

        active_tasks = list(
            task_qs.filter(status=Task.Status.IN_PROGRESS)
            .values("id", "title", "priority", "due_date",
                    "assigned_to__first_name", "assigned_to__last_name", "assigned_to__username")
            .order_by("-updated_at")[:5]
        )
        for t in active_tasks:
            t["id"] = str(t["id"])
            t["due_date"] = str(t["due_date"]) if t["due_date"] else None
            fn = (t.pop("assigned_to__first_name") or "").strip()
            ln = (t.pop("assigned_to__last_name") or "").strip()
            un = t.pop("assigned_to__username") or ""
            t["assigned_user"] = (f"{fn} {ln}".strip()) or un or "Unassigned"

        today_completed_tasks = list(
            task_qs.filter(
                status=Task.Status.COMPLETED,
                updated_at__gte=cutoff_12h,
            )
            .values("id", "title", "updated_at",
                    "assigned_to__first_name", "assigned_to__last_name", "assigned_to__username")
            .order_by("-updated_at")[:5]
        )
        for t in today_completed_tasks:
            t["id"] = str(t["id"])
            t["updated_at"] = t["updated_at"].isoformat()
            fn = (t.pop("assigned_to__first_name") or "").strip()
            ln = (t.pop("assigned_to__last_name") or "").strip()
            un = t.pop("assigned_to__username") or ""
            t["assigned_user"] = (f"{fn} {ln}".strip()) or un or "Unassigned"

        low_stock_items = [i for i in items_qs if i.is_low_stock]
        overdue_tasks = task_qs.filter(
            due_date__lt=today,
            status__in=[Task.Status.TODO, Task.Status.IN_PROGRESS],
        ).count()

        # --- Tracked time (scoped to user for EMPLOYEE role) ---
        sessions_qs = TaskWorkSession.objects.filter(
            task__farm_id__in=farm_ids,
            end_time__isnull=False,
        )
        if is_employee:
            sessions_qs = sessions_qs.filter(user=user)

        user_times = (
            sessions_qs
            .values("user", "user__username", "user__first_name", "user__last_name")
            .annotate(total_duration=Sum(
                ExpressionWrapper(
                    F("end_time") - F("start_time"),
                    output_field=DurationField(),
                )
            ))
            .order_by("-total_duration")[:10]
        )
        top_tracked_users = []
        for ut in user_times:
            td = ut["total_duration"]
            if td is None:
                continue
            total_secs = int(td.total_seconds())
            top_tracked_users.append({
                "user_id": str(ut["user"]),
                "username": ut["user__username"],
                "full_name": f"{ut['user__first_name'] or ''} {ut['user__last_name'] or ''}".strip(),
                "total_minutes": round(total_secs / 60, 1),
                "total_hours": round(total_secs / 3600, 1),
            })

        # --- GPS: today's active employees with latest location ---
        today_pings = LocationPing.objects.filter(
            farm_id__in=farm_ids,
            recorded_at__date=today,
            latitude__isnull=False,
        ).select_related("user", "farm").order_by("user_id", "-recorded_at")

        # Get latest ping per user (today only)
        latest_per_user = {}
        for ping in today_pings:
            uid = str(ping.user_id)
            if uid not in latest_per_user:
                latest_per_user[uid] = {
                    "user_id": ping.user_id,
                    "user_name": ping.user.get_full_name() or ping.user.username,
                    "farm_name": ping.farm.name if ping.farm else None,
                    "latitude": float(ping.latitude),
                    "longitude": float(ping.longitude),
                    "activity": ping.activity,
                    "recorded_at": ping.recorded_at.isoformat(),
                }

        today_gps = list(latest_per_user.values())
        today_gps.sort(key=lambda p: p["recorded_at"], reverse=True)

        from apps.documents.models import Document
        from apps.breakdowns.models import BreakdownReport
        from django.contrib.auth import get_user_model
        User = get_user_model()

        doc_qs = Document.objects.filter(farm_id__in=farm_ids)
        total_documents = doc_qs.count()

        breakdown_qs = BreakdownReport.objects.filter(farm_id__in=farm_ids)
        total_breakdowns = breakdown_qs.count()
        open_breakdowns = breakdown_qs.exclude(status="RESOLVED").count()

        # "Total Users" must match what the Users page lists (all users that
        # aren't soft-deleted), not just currently-active ones — otherwise the
        # dashboard shows e.g. 4 while the Users page shows 32.
        total_users = User.objects.filter(deleted_at__isnull=True).count()

        # ── Farm breakdown for the HR box on the dashboard ─────────────────
        # Counts Employee records per farm (every Employee always has a farm
        # FK set, which is more reliable than the User.farms M2M).  Farms with
        # zero employees still appear so Super Admins see every farm.
        # Also count employees who have checked in today but not yet checked out.
        from django.db.models import OuterRef, Subquery, Value
        from django.db.models.functions import Coalesce

        # Subquery: count checked-in employees for each farm (checked in today, not checked out)
        checked_in_subquery = Attendance.objects.filter(
            employee__farm_id=OuterRef("id"),
            date=today,
            check_in_time__isnull=False,
            check_out_time__isnull=True,
        ).values("employee__farm_id").annotate(cnt=Count("id")).values("cnt")

        # Subquery: everyone who completed a successful check-in today
        # (status=PRESENT or PRESENT_DONE + check_in_time IS NOT NULL)
        checkin_today_subquery = Attendance.objects.filter(
            employee__farm_id=OuterRef("id"),
            date=today,
            status__in=[Attendance.Status.PRESENT, Attendance.Status.PRESENT_DONE],
            check_in_time__isnull=False,
        ).values("employee__farm_id").annotate(cnt=Count("id")).values("cnt")

        absent_today_subquery = Attendance.objects.filter(
            employee__farm_id=OuterRef("id"), date=today,
            status=Attendance.Status.ABSENT,
        ).values("employee__farm_id").annotate(cnt=Count("id")).values("cnt")

        on_leave_subquery = Attendance.objects.filter(
            employee__farm_id=OuterRef("id"), date=today,
            status=Attendance.Status.LEAVE,
        ).values("employee__farm_id").annotate(cnt=Count("id")).values("cnt")

        farms_with_emp_counts = farms_qs.annotate(
            total_count=Count("employees"),
            active_count=Count("employees", filter=Q(employees__is_active=True)),
            checked_in_count=Coalesce(Subquery(checked_in_subquery), Value(0)),
            checkin_today_count=Coalesce(Subquery(checkin_today_subquery), Value(0)),
            absent_today_count=Coalesce(Subquery(absent_today_subquery), Value(0)),
            on_leave_count=Coalesce(Subquery(on_leave_subquery), Value(0)),
        )
        farm_user_breakdown = [
            {
                "farm_id": str(farm.id),
                "farm_name": farm.name,
                "total_count": farm.total_count,
                "active_count": farm.active_count,
                "checked_in_count": farm.checked_in_count,
                "checkin_today_count": farm.checkin_today_count,
                "absent_today_count": farm.absent_today_count,
                "on_leave_count": farm.on_leave_count,
            }
            for farm in farms_with_emp_counts
        ]

        # ── Yearly ledger (Varshik Hishab), monthly series, category split ────
        from django.db.models.functions import ExtractMonth, ExtractYear

        current_year = today.year
        last_year = current_year - 1

        exp_appr = Expense.objects.filter(
            farm_id__in=farm_ids, status=Expense.Status.APPROVED
        )
        rev_all = RevenueEntry.objects.filter(farm_id__in=farm_ids)

        this_month_expenses = (
            exp_appr.filter(date__year=current_year, date__month=today.month)
            .aggregate(s=Sum("amount"))["s"] or 0
        )
        this_month_revenue = (
            rev_all.filter(date__year=current_year, date__month=today.month)
            .aggregate(s=Sum("amount"))["s"] or 0
        )

        exp_by_year = dict(
            exp_appr.annotate(y=ExtractYear("date")).values("y")
            .annotate(s=Sum("amount")).values_list("y", "s")
        )
        rev_by_year = dict(
            rev_all.annotate(y=ExtractYear("date")).values("y")
            .annotate(s=Sum("amount")).values_list("y", "s")
        )
        year_set = {y for y in (set(exp_by_year) | set(rev_by_year)) if y}
        year_set.add(current_year)
        yearly = []
        for y in sorted(year_set, reverse=True):
            e = float(exp_by_year.get(y) or 0)
            r = float(rev_by_year.get(y) or 0)
            n = r - e
            yearly.append({
                "year": y, "expenses": e, "revenue": r, "net": n,
                "margin": round(n / r * 100, 2) if r else 0,
            })

        this_year_expenses = float(exp_by_year.get(current_year) or 0)
        this_year_revenue = float(rev_by_year.get(current_year) or 0)
        this_year_net = this_year_revenue - this_year_expenses

        def _pct(cur, prev):
            return round((cur - prev) / prev * 100, 1) if prev else None
        ly_exp = float(exp_by_year.get(last_year) or 0)
        ly_rev = float(rev_by_year.get(last_year) or 0)

        # Monthly expenses/revenue keyed by year (for the line + bar charts).
        monthly = {}

        def _year_months(yr):
            key = str(yr)
            if key not in monthly:
                monthly[key] = [{"month": i + 1, "expenses": 0.0, "revenue": 0.0} for i in range(12)]
            return monthly[key]

        for row in exp_appr.annotate(y=ExtractYear("date"), m=ExtractMonth("date")).values("y", "m").annotate(s=Sum("amount")):
            if row["y"] and row["m"]:
                _year_months(row["y"])[row["m"] - 1]["expenses"] = float(row["s"] or 0)
        for row in rev_all.annotate(y=ExtractYear("date"), m=ExtractMonth("date")).values("y", "m").annotate(s=Sum("amount")):
            if row["y"] and row["m"]:
                _year_months(row["y"])[row["m"] - 1]["revenue"] = float(row["s"] or 0)
        _year_months(current_year)

        expenses_by_category = [
            {"category": r["category"], "total": float(r["s"] or 0)}
            for r in exp_appr.filter(date__year=current_year)
            .values("category").annotate(s=Sum("amount")).order_by("-s")
        ]

        # Recent transactions — most recent expenses + revenue, merged.
        recent_transactions = []
        for e in exp_appr.select_related("farm").order_by("-date", "-created_at")[:8]:
            recent_transactions.append({
                "type": "EXPENSE",
                "label": (e.description or e.get_category_display()),
                "farm_name": e.farm.name if e.farm_id else None,
                "amount": float(e.amount or 0),
                "date": str(e.date) if e.date else None,
            })
        for r in rev_all.select_related("farm").order_by("-date", "-created_at")[:8]:
            recent_transactions.append({
                "type": "REVENUE",
                "label": (r.description or getattr(r, "get_source_display", lambda: "Revenue")()),
                "farm_name": r.farm.name if r.farm_id else None,
                "amount": float(r.amount or 0),
                "date": str(r.date) if r.date else None,
            })
        recent_transactions.sort(key=lambda x: x["date"] or "", reverse=True)
        recent_transactions = recent_transactions[:8]

        upcoming_tasks = [
            {
                "id": str(tk.id),
                "title": tk.title,
                "farm_name": tk.farm.name if tk.farm_id else None,
                "due_date": str(tk.due_date) if tk.due_date else None,
                "priority": tk.priority,
            }
            for tk in task_qs.filter(
                due_date__gte=today,
                status__in=[Task.Status.TODO, Task.Status.IN_PROGRESS],
            ).select_related("farm").order_by("due_date")[:6]
        ]

        on_leave_today = att_qs.filter(date=today, status=Attendance.Status.LEAVE).count()
        active_employees = emp_qs.filter(is_active=True).count()
        try:
            cultivated_fields = (
                Crop.objects.filter(farm_id__in=farm_ids, field__isnull=False)
                .values("field").distinct().count()
            )
        except Exception:
            cultivated_fields = active_crops

        alerts = []
        if low_stock_items:
            alerts.append(f"{len(low_stock_items)} item(s) are low on stock")
        if pending_approvals:
            alerts.append(f"{pending_approvals} attendance record(s) pending approval")
        if overdue_tasks:
            alerts.append(f"{overdue_tasks} task(s) are overdue")

        return Response(
            {
                "farm_kpis": {
                    "total_farms": total_farms,
                    "total_area": total_area,
                    "total_fields": total_fields,
                    "cultivated_fields": cultivated_fields,
                },
                "workforce_kpis": {
                    "total_employees": emp_qs.count(),
                    "active_employees": active_employees,
                    "present_today": present_today,
                    "absent_today": absent_today,
                    "on_leave_today": on_leave_today,
                    "checked_in_now": checked_in_now,
                    "manager_count": manager_count,
                    "pending_approvals": pending_approvals,
                    "farm_breakdown": farm_user_breakdown,
                },
                "crop_kpis": {
                    "active_crops": active_crops,
                    "total_harvest_qty": total_harvest_qty,
                },
                "financial_kpis": {
                    "total_expenses": total_expenses,
                    "total_revenue": total_revenue,
                    "net": total_revenue - total_expenses,
                    "farm_breakdown": financial_breakdown,
                    "total_advances": total_advances,
                    "outstanding_advances": outstanding_advances,
                    "total_deductions": total_deductions,
                    "total_incentives": total_incentives,
                    "total_payments": total_payments,
                    # This-year / this-month figures for the redesigned dashboard.
                    "this_year_expenses": this_year_expenses,
                    "this_year_revenue": this_year_revenue,
                    "this_year_net": this_year_net,
                    "this_year_margin": round(this_year_net / this_year_revenue * 100, 2) if this_year_revenue else 0,
                    "this_month_expenses": float(this_month_expenses or 0),
                    "this_month_revenue": float(this_month_revenue or 0),
                    "expenses_change_pct": _pct(this_year_expenses, ly_exp),
                    "revenue_change_pct": _pct(this_year_revenue, ly_rev),
                    "net_change_pct": _pct(this_year_net, ly_rev - ly_exp),
                    "yearly": yearly,
                    "monthly": monthly,
                    "expenses_by_category": expenses_by_category,
                },
                "recent_transactions": recent_transactions,
                "upcoming_tasks": upcoming_tasks,
                "inventory_kpis": {
                    "total_items": items_qs.count(),
                    "low_stock_count": low_stock_count,
                    "stock_value": stock_value,
                },
                "task_kpis": {
                    "open_tasks": open_tasks,
                    "completed_tasks": completed_tasks,
                    "active_tasks": active_tasks,
                    "today_completed_tasks": today_completed_tasks,
                },
                "document_kpis": {
                    "total_documents": total_documents,
                },
                "breakdown_kpis": {
                    "total_breakdowns": total_breakdowns,
                    "open_breakdowns": open_breakdowns,
                },
                "admin_kpis": {
                    "total_users": total_users,
                },
                "top_tracked_users": top_tracked_users,
                "today_gps": today_gps,
                "alerts": alerts,
            }
        )


class AttendanceReportView(APIView):
    permission_classes = [IsManagerOrAdmin]
    serializer_class = serializers.Serializer

    def get(self, request):
        farm_ids = get_accessible_farm_ids(request.user)
        qs = Attendance.objects.filter(farm_id__in=farm_ids)

        farm = request.query_params.get("farm")
        start = request.query_params.get("start")
        end = request.query_params.get("end")
        if farm:
            qs = qs.filter(farm_id=farm)
        if start:
            qs = qs.filter(date__gte=start)
        if end:
            qs = qs.filter(date__lte=end)

        rows = (
            qs.values("date")
            .annotate(
                present=Count("id", filter=Q(status__in=[Attendance.Status.PRESENT, Attendance.Status.PRESENT_DONE])),
                absent=Count("id", filter=Q(status=Attendance.Status.ABSENT)),
                leave=Count("id", filter=Q(status=Attendance.Status.LEAVE)),
            )
            .order_by("date")
        )
        return Response(list(rows))


class PayrollReportView(APIView):
    permission_classes = [IsManagerOrAdmin]
    serializer_class = serializers.Serializer

    def get(self, request):
        from apps.payroll.models import Payslip

        farm_ids = get_accessible_farm_ids(request.user)
        rows = (
            Payslip.objects.filter(farm_id__in=farm_ids)
            .values("period__year", "period__month")
            .annotate(total_net_pay=Sum("net_pay"), payslip_count=Count("id"))
            .order_by("period__year", "period__month")
        )
        results = [
            {
                "year": r["period__year"],
                "month": r["period__month"],
                "total_net_pay": r["total_net_pay"] or 0,
                "payslip_count": r["payslip_count"],
            }
            for r in rows
        ]
        return Response(results)


class TimeTrackingReportView(APIView):
    """
    GET /api/v1/reporting/time-tracking/?farm=...&start=2026-01-01&end=2026-06-18
    Returns per-user tracked time with task breakdown and totals.
    """

    permission_classes = [IsManagerOrAdmin]
    serializer_class = serializers.Serializer

    def get(self, request):
        farm_ids = get_accessible_farm_ids(request.user)

        # Reusable duration expression
        duration_expr = ExpressionWrapper(
            F("end_time") - F("start_time"),
            output_field=DurationField(),
        )

        qs = TaskWorkSession.objects.filter(
            task__farm_id__in=farm_ids,
            end_time__isnull=False,
        )

        farm = request.query_params.get("farm")
        start = request.query_params.get("start")
        end = request.query_params.get("end")

        if farm:
            qs = qs.filter(task__farm_id=farm)
        if start:
            qs = qs.filter(start_time__gte=start)
        if end:
            # end date inclusive — cover the full day
            qs = qs.filter(start_time__lte=f"{end}T23:59:59")

        # Aggregate per user
        user_groups = (
            qs.values(
                "user", "user__username", "user__first_name", "user__last_name"
            )
            .annotate(total_duration=Sum(duration_expr))
            .order_by("-total_duration")
        )

        rows = []
        for ug in user_groups:
            td = ug["total_duration"]
            if td is None:
                continue
            total_secs = int(td.total_seconds())
            rows.append({
                "user_id": str(ug["user"]),
                "username": ug["user__username"],
                "full_name": f"{ug['user__first_name'] or ''} {ug['user__last_name'] or ''}".strip(),
                "total_minutes": round(total_secs / 60, 1),
                "total_hours": round(total_secs / 3600, 1),
                "task_count": 0,
            })

        # Per-task breakdown for each user
        per_user_tasks = (
            qs.values(
                "user", "user__username", "user__first_name", "user__last_name",
                "task__title", "task__id",
            )
            .annotate(task_duration=Sum(duration_expr))
            .order_by("user", "-task_duration")
        )

        # Build task breakdown map
        breakdown_map = {}
        task_counts = {}
        for pt in per_user_tasks:
            uid = str(pt["user"])
            td = pt["task_duration"]
            if td is None:
                continue
            secs = int(td.total_seconds())
            if uid not in breakdown_map:
                breakdown_map[uid] = []
                task_counts[uid] = 0
            breakdown_map[uid].append({
                "task_id": str(pt["task__id"]),
                "task_title": pt["task__title"],
                "minutes": round(secs / 60, 1),
                "hours": round(secs / 3600, 1),
            })
            task_counts[uid] = task_counts.get(uid, 0) + 1

        for r in rows:
            r["tasks"] = breakdown_map.get(r["user_id"], [])
            r["task_count"] = task_counts.get(r["user_id"], 0)

        # Totals
        total_dur = qs.aggregate(total_dur=Sum(duration_expr))["total_dur"]
        total_seconds = int(total_dur.total_seconds()) if total_dur else 0

        return Response({
            "rows": rows,
            "total_users": len(rows),
            "total_hours": round(total_seconds / 3600, 1),
            "total_minutes": round(total_seconds / 60, 1),
        })


class InventoryReportView(APIView):
    permission_classes = [IsManagerOrAdmin]
    serializer_class = serializers.Serializer

    def get(self, request):
        farm_ids = get_accessible_farm_ids(request.user)
        items = Item.objects.filter(farm_id__in=farm_ids)

        total_stock_value = 0
        low_stock = []
        for item in items:
            total_stock_value += item.current_stock * item.unit_cost
            if item.current_stock <= item.reorder_level:
                low_stock.append(
                    {
                        "id": str(item.id),
                        "name": item.name,
                        "sku": item.sku,
                        "current_stock": item.current_stock,
                        "reorder_level": item.reorder_level,
                    }
                )

        return Response(
            {
                "item_count": items.count(),
                "total_stock_value": total_stock_value,
                "low_stock": low_stock,
            }
        )


class CropReportView(APIView):
    permission_classes = [IsManagerOrAdmin]
    serializer_class = serializers.Serializer

    def get(self, request):
        farm_ids = get_accessible_farm_ids(request.user)
        rows = (
            HarvestRecord.objects.filter(farm_id__in=farm_ids)
            .values("crop__name")
            .annotate(total_quantity=Sum("quantity"), total_revenue=Sum("revenue"))
            .order_by("crop__name")
        )
        results = [
            {
                "crop": r["crop__name"],
                "total_quantity": r["total_quantity"] or 0,
                "total_revenue": r["total_revenue"] or 0,
            }
            for r in rows
        ]
        return Response(results)


class FinanceReportView(APIView):
    permission_classes = [IsManagerOrAdmin]
    serializer_class = serializers.Serializer

    def get(self, request):
        farm_ids = get_accessible_farm_ids(request.user)

        expense_rows = (
            Expense.objects.filter(farm_id__in=farm_ids)
            .values("category")
            .annotate(total=Sum("amount"))
            .order_by("category")
        )
        expenses_by_category = [
            {"category": r["category"], "total": r["total"] or 0}
            for r in expense_rows
        ]
        total_expenses = (
            Expense.objects.filter(farm_id__in=farm_ids).aggregate(s=Sum("amount"))[
                "s"
            ]
            or 0
        )
        total_revenue = (
            RevenueEntry.objects.filter(farm_id__in=farm_ids).aggregate(
                s=Sum("amount")
            )["s"]
            or 0
        )

        return Response(
            {
                "expenses_by_category": expenses_by_category,
                "total_expenses": total_expenses,
                "total_revenue": total_revenue,
                "net": total_revenue - total_expenses,
            }
        )
