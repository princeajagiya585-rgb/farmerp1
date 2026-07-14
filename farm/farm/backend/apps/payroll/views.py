from calendar import monthrange
from datetime import date
from decimal import Decimal

from django.utils import timezone

from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.mixins import BaseModelViewSet, EmployeeSelfScopedMixin
from apps.accounts.models import Role
from apps.farms.views import FarmScopedQuerysetMixin
from apps.workforce.models import Employee, Attendance

from .models import (
    PayrollPeriod,
    Advance,
    Incentive,
    Deduction,
    Payslip,
    Payment,
)
from .serializers import (
    PayrollPeriodSerializer,
    AdvanceSerializer,
    IncentiveSerializer,
    DeductionSerializer,
    PayslipSerializer,
    PaymentSerializer,
)


def _advance_deduction_for(employee, farm, period):
    """Advance amount to recover on this payslip.

    Business rule (what admins expect): when an advance is recorded for an
    employee it must show in the Advances column of that employee's CURRENT
    payslip and reduce Net Pay — regardless of the exact date of the advance
    or how much the employee earned that month.

    So we recover the FULL outstanding advance balance on the employee's
    LATEST payslip period (highest year, month) and 0 on any older payslip —
    the advance shows exactly once, on the most recent payslip the admin is
    working with. There is deliberately no "cap at earned wage": the whole
    advance is shown and Net Pay may drop to/below zero (the worker owes it).

    Recovery moves forward automatically: once a newer period is generated,
    the advance is recovered there instead and older payslips recompute to 0.
    """
    latest = (
        PayrollPeriod.objects
        .filter(farm=farm, payslips__employee=employee)
        .order_by("-year", "-month")
        .first()
    )
    # `period` counts as the latest if no payslip exists yet (e.g. during
    # generate(), before the row is written) or it is >= the newest existing
    # payslip period.
    is_latest = (
        latest is None
        or (period.year, period.month) >= (latest.year, latest.month)
    )
    if not is_latest:
        return Decimal("0")

    total = Decimal("0")
    for adv in Advance.objects.filter(
        employee=employee,
        farm=farm,
        status=Advance.Status.OUTSTANDING,
    ):
        balance = adv.balance
        if balance > 0:
            total += balance
    return total


def _attendance_worked_days(employee, month, year):
    """(days_worked, overtime_hours, worked_hours) for an employee in a month.

    Honors the admin attendance override (``AttendanceMonthlySummary``) edited on
    the Attendance Reports "Edit" screen: when an override exists for
    (employee, year, month) its Present / Half-Day drive ``days_worked``
    (present + ½·half_day) and its OT hours drive overtime, so an edited month's
    attendance flows straight into salary. Without an override the values are
    summed from the raw daily ``Attendance`` records (same rule as before).
    """
    from apps.workforce.models import AttendanceMonthlySummary

    # Excludes only explicitly rejected/failed records — matches generate().
    raw = Attendance.objects.filter(
        employee=employee, date__month=month, date__year=year
    ).exclude(
        approval_status__in=[
            Attendance.ApprovalStatus.REJECTED,
            Attendance.ApprovalStatus.FAILED,
        ]
    )

    # Clocked hours (needed for hourly wage) always come from the raw records —
    # the monthly override does not track them.
    worked_hours = Decimal("0")
    for att in raw:
        worked_hours += Decimal(att.working_seconds or 0) / Decimal("3600")

    ov = AttendanceMonthlySummary.objects.filter(
        employee=employee, year=year, month=month
    ).first()
    if ov is not None:
        days_worked = Decimal(ov.present or 0) + Decimal("0.5") * Decimal(ov.half_day or 0)
        overtime_hours = Decimal(ov.overtime_hours or 0)
        return days_worked, overtime_hours, worked_hours

    days_worked = Decimal("0")
    overtime_hours = Decimal("0")
    for att in raw:
        if att.status in (
            Attendance.Status.PRESENT,
            Attendance.Status.PRESENT_DONE,
        ):
            days_worked += Decimal("1")
        elif att.status == Attendance.Status.HALF_DAY:
            days_worked += Decimal("0.5")
        overtime_hours += att.overtime_hours or Decimal("0")
    return days_worked, overtime_hours, worked_hours


def _wage_from_worked(employee, period, days_worked, overtime_hours, worked_hours):
    """(gross_wage, overtime_amount) from worked days/hours.

    The single source of the pay formula, shared by payroll generation and the
    attendance-driven resync so they can never drift:
      • Hourly wage   → rate × hours actually worked.
      • Monthly salary → one day's salary (monthly ÷ days-in-month) per day worked.
      • daily_wage    → legacy fallback.
    """
    daily_wage = employee.daily_wage or Decimal("0")
    monthly_salary = employee.monthly_salary or Decimal("0")
    hourly_wage = employee.hourly_wage or Decimal("0")
    days_in_month = Decimal(monthrange(period.year, period.month)[1])

    if employee.wage_type == Employee.WageType.HOURLY and hourly_wage > 0:
        gross_wage = worked_hours * hourly_wage
    elif monthly_salary > 0:
        gross_wage = days_worked * (monthly_salary / days_in_month)
    elif daily_wage > 0:
        gross_wage = days_worked * daily_wage
    else:
        gross_wage = monthly_salary

    effective_daily = (
        daily_wage if daily_wage > 0
        else (monthly_salary / Decimal("30")) if monthly_salary > 0
        else Decimal("0")
    )
    overtime_amount = overtime_hours * (effective_daily / Decimal("8"))
    return gross_wage, overtime_amount


def _rebuild_payslip_for_period(employee, period):
    """Recompute and save the employee's payslip for `period` from attendance
    (honoring the monthly override), including incentives / deductions / advance.
    Skips a Paid / Finalized payslip. Creates the payslip if it doesn't exist."""
    slip = Payslip.objects.filter(employee=employee, period=period).first()
    if slip and slip.status in (Payslip.Status.PAID, Payslip.Status.FINALIZED):
        return

    days_worked, overtime_hours, worked_hours = _attendance_worked_days(
        employee, period.month, period.year
    )
    gross_wage, overtime_amount = _wage_from_worked(
        employee, period, days_worked, overtime_hours, worked_hours
    )

    incentive_amount = Decimal("0")
    for inc in Incentive.objects.filter(
        employee=employee, farm=period.farm, date__month=period.month, date__year=period.year
    ):
        incentive_amount += inc.amount or Decimal("0")

    other_deductions = Decimal("0")
    for ded in Deduction.objects.filter(
        employee=employee, farm=period.farm, date__month=period.month, date__year=period.year
    ):
        other_deductions += ded.amount or Decimal("0")

    advance_deduction = _advance_deduction_for(employee, period.farm, period)
    net_pay = (
        gross_wage + overtime_amount + incentive_amount
        - advance_deduction - other_deductions
    )

    Payslip.objects.update_or_create(
        employee=employee,
        period=period,
        defaults={
            "farm": period.farm,
            "days_worked": days_worked,
            "overtime_hours": overtime_hours,
            "gross_wage": gross_wage,
            "overtime_amount": overtime_amount,
            "incentive_amount": incentive_amount,
            "advance_deduction": advance_deduction,
            "other_deductions": other_deductions,
            "net_pay": net_pay,
        },
    )


def _resync_payslip_from_attendance(employee, month, year, user=None):
    """After the monthly attendance is edited, make the Payslips page reflect it
    for (month, year): rebuild the employee's payslip so its days worked and
    salary follow the edited attendance.

    Unlike ``_sync_payslip``, this DOES create the payslip (and its payroll
    period) when none exists yet, so an edited month's days & pay show on the
    Payslips page immediately. A Paid / Finalized payslip is never touched.
    """
    farm = employee.farm
    if farm is None:
        return  # can't place a payslip without a home farm

    # Rebuild every existing payslip for this employee in the month (usually one,
    # under the home farm), then ensure the home-farm period/payslip exists.
    existing = list(
        Payslip.objects.filter(
            employee=employee, period__month=month, period__year=year
        ).select_related("period")
    )
    handled_period_ids = set()
    for slip in existing:
        _rebuild_payslip_for_period(employee, slip.period)
        handled_period_ids.add(slip.period_id)

    period, _ = PayrollPeriod.objects.get_or_create(
        farm=farm, month=month, year=year, defaults={"created_by": user}
    )
    if period.id not in handled_period_ids:
        _rebuild_payslip_for_period(employee, period)


def _sync_payslip(employee, farm, month, year):
    """Sync the employee's payslip for the given pay period after an
    advance / incentive / deduction is created, updated or deleted.

    If no PayrollPeriod exists for (farm, month, year) the function
    silently returns — there's nothing to sync to yet.
    """
    try:
        period = PayrollPeriod.objects.get(farm=farm, month=month, year=year)
    except PayrollPeriod.DoesNotExist:
        return

    # Only sync payslips that were already generated (with the correct
    # days×wage / overtime). If none exists yet, the next "generate" will
    # compute it fresh — don't create a bogus monthly-salary-only payslip here.
    existing = Payslip.objects.filter(employee=employee, period=period).first()
    if not existing:
        return
    # Never overwrite a closed (paid/finalised) payslip.
    if existing.status in (Payslip.Status.PAID, Payslip.Status.FINALIZED):
        return
    gross_wage = existing.gross_wage or Decimal("0")
    overtime_amount = existing.overtime_amount or Decimal("0")

    # Recalculate incentive amount from all incentives for this period
    incentive_amount = Decimal("0")
    for inc in Incentive.objects.filter(
        employee=employee,
        farm=farm,
        date__month=month,
        date__year=year,
    ):
        incentive_amount += inc.amount or Decimal("0")

    # Recalculate other deductions for this period
    other_deductions = Decimal("0")
    for ded in Deduction.objects.filter(
        employee=employee,
        farm=farm,
        date__month=month,
        date__year=year,
    ):
        other_deductions += ded.amount or Decimal("0")

    # Recover the full outstanding advance on the employee's latest payslip
    # (see _advance_deduction_for). No wage cap — the advance always shows.
    advance_deduction = _advance_deduction_for(employee, farm, period)

    # Same formula as payroll generation: wage + OT + incentive − advance − deductions
    net_pay = gross_wage + overtime_amount + incentive_amount - advance_deduction - other_deductions

    Payslip.objects.update_or_create(
        employee=employee,
        period=period,
        defaults={
            "farm": farm,
            "gross_wage": gross_wage,
            "overtime_amount": overtime_amount,
            "incentive_amount": incentive_amount,
            "advance_deduction": advance_deduction,
            "other_deductions": other_deductions,
            "net_pay": net_pay,
        },
    )


def _record_salary_expense(*, farm, amount, date, description, user):
    """Auto-record a salary payout as a LABOUR expense in Financial Management.

    Salary is an operating expense, so every actual disbursement — an advance
    given, a part ("Half Pay") payment, or the remaining balance settled when a
    payslip is closed — adds a matching, already-approved entry to the Expenses
    table. Amounts are split so they never double count: half-pays expense the
    part paid and the close expenses only the leftover (net − already paid).
    """
    if amount is None:
        return
    amount = Decimal(str(amount))
    if amount <= 0:
        return
    from apps.finance.models import Expense
    owner = user if getattr(user, "is_authenticated", False) else None
    Expense.objects.create(
        farm=farm,
        category=Expense.Category.LABOUR,
        amount=amount,
        date=date,
        description=description,
        status=Expense.Status.APPROVED,
        is_paid=True,
        approved_by=owner,
        created_by=owner,
    )


def _resync_advance_payslips(employee, farm):
    """Re-sync every existing payslip for this employee+farm after an advance
    is created, edited or deleted.

    Each payslip recomputes its advance via ``_advance_deduction_for`` (full
    outstanding balance on the latest payslip, 0 on older ones), so the
    Advances column and Net Pay update immediately no matter what date the
    advance has — matching only the advance's own month used to miss the
    payslip whenever the months differed.
    """
    periods = (
        PayrollPeriod.objects.filter(farm=farm, payslips__employee=employee)
        .distinct()
    )
    for period in periods:
        _sync_payslip(employee, farm, period.month, period.year)


class PayrollPeriodViewSet(FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = PayrollPeriod.objects.select_related("farm").all()
    serializer_class = PayrollPeriodSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["farm", "month", "year", "status"]
    search_fields = []

    @action(detail=True, methods=["post"])
    def generate(self, request, pk=None):
        """Generate payslips for all employees of the period's farm."""
        period = self.get_object()
        try:
            created = 0
            total_net = Decimal("0")

            employees = Employee.objects.filter(farm=period.farm, is_active=True)
            for employee in employees:
                # Count attendance as soon as it is marked — a present/half-day
                # record reflects in pay immediately without waiting for a
                # separate approval step. Only explicitly rejected/failed
                # records are excluded (auto check-out and mark-absent already
                # approve themselves).
                #
                # NOTE: we do NOT filter by farm here. A worker assigned to
                # several farms may check in at any of them, so their day is
                # recorded against whichever farm's geofence matched — but the
                # payslip belongs to the employee's home-farm period, so every
                # attendance day of theirs must count no matter where it was
                # recorded. Filtering by period.farm silently dropped cross-farm
                # days (e.g. a half day at another assigned farm → days_worked 0).
                # Days worked / overtime honor the admin attendance override
                # (Attendance Reports "Edit"): an edited month's Present/Half-Day
                # drives pay. Without an override they are summed from the raw
                # daily records. A HALF_DAY is worth half a day; ABSENT nothing.
                days_worked, overtime_hours, worked_hours = _attendance_worked_days(
                    employee, period.month, period.year
                )
                # Pay is driven purely by attendance (see _wage_from_worked):
                #  • Hourly wage  → rate × hours actually worked.
                #  • Monthly salary → one day's salary (monthly ÷ days-in-month)
                #    per day worked; a HALF_DAY earns half — matching the
                #    Payslips page and the "Done" payout.
                #  • daily_wage is a legacy fallback (neither monthly nor hourly).
                gross_wage, overtime_amount = _wage_from_worked(
                    employee, period, days_worked, overtime_hours, worked_hours
                )

                # Incentives for the period
                incentive_amount = Decimal("0")
                for inc in Incentive.objects.filter(
                    employee=employee,
                    farm=period.farm,
                    date__month=period.month,
                    date__year=period.year,
                ):
                    incentive_amount += inc.amount or Decimal("0")

                # Other deductions for the period
                other_deductions = Decimal("0")
                for ded in Deduction.objects.filter(
                    employee=employee,
                    farm=period.farm,
                    date__month=period.month,
                    date__year=period.year,
                ):
                    other_deductions += ded.amount or Decimal("0")

                # Outstanding advances: recover the full balance on the
                # employee's latest payslip (same rule as _sync_payslip so
                # generation and live edits always agree).
                advance_deduction = _advance_deduction_for(
                    employee, period.farm, period
                )

                net_pay = (
                    gross_wage
                    + overtime_amount
                    + incentive_amount
                    - advance_deduction
                    - other_deductions
                )

                payslip, _ = Payslip.objects.update_or_create(
                    employee=employee,
                    period=period,
                    defaults={
                        "farm": period.farm,
                        "days_worked": days_worked,
                        "overtime_hours": overtime_hours,
                        "gross_wage": gross_wage,
                        "overtime_amount": overtime_amount,
                        "incentive_amount": incentive_amount,
                        "advance_deduction": advance_deduction,
                        "other_deductions": other_deductions,
                        "net_pay": net_pay,
                        "created_by": request.user,
                    },
                )
                created += 1
                # Remaining net to pay (matches the payslips table) = net − already paid
                total_net += net_pay - (payslip.half_paid or Decimal("0"))

            period.status = PayrollPeriod.Status.GENERATED
            period.generated_at = timezone.now()
            period.save()

            return Response(
                {"created": created, "total_net": total_net}, status=200
            )
        except Exception as exc:  # pragma: no cover - defensive
            return Response({"detail": str(exc)}, status=400)


class AdvanceViewSet(EmployeeSelfScopedMixin, FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = Advance.objects.select_related("employee", "farm").all()
    serializer_class = AdvanceSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["employee", "farm", "status"]
    search_fields = ["reason"]

    @staticmethod
    def _sync_status(advance):
        """Keep status consistent with the numbers: fully repaid → CLEARED,
        otherwise OUTSTANDING. Fixes mismatches after a manual edit."""
        repaid = advance.amount_repaid or Decimal("0")
        amount = advance.amount or Decimal("0")
        new_status = (
            Advance.Status.CLEARED if amount > 0 and repaid >= amount
            else Advance.Status.OUTSTANDING
        )
        if advance.status != new_status:
            advance.status = new_status
            advance.save(update_fields=["status"])

    def perform_create(self, serializer):
        advance = serializer.save()
        self._sync_status(advance)
        _resync_advance_payslips(advance.employee, advance.farm)
        # An advance is cash paid out now → record it as a salary expense.
        _record_salary_expense(
            farm=advance.farm,
            amount=advance.amount,
            date=advance.date,
            description=f"Salary advance — {advance.employee.name}",
            user=self.request.user,
        )

    def perform_update(self, serializer):
        advance = serializer.save()
        self._sync_status(advance)
        _resync_advance_payslips(advance.employee, advance.farm)

    def perform_destroy(self, instance):
        employee = instance.employee
        farm = instance.farm
        instance.delete()
        _resync_advance_payslips(employee, farm)

    @action(detail=False, methods=["get"])
    def outstanding(self, request):
        """Advance outstanding report: all advances with a remaining balance."""
        qs = self.filter_queryset(self.get_queryset()).filter(
            status=Advance.Status.OUTSTANDING
        )
        rows = []
        total = Decimal("0")
        for adv in qs:
            if adv.balance <= 0:
                continue
            total += adv.balance
            rows.append(AdvanceSerializer(adv, context={"request": request}).data)
        return Response(
            {"count": len(rows), "rows": rows, "total_outstanding": total}
        )

    @action(detail=True, methods=["post"])
    def repay(self, request, pk=None):
        """Record a repayment against an advance; auto-clears when fully repaid."""
        advance = self.get_object()
        try:
            amount = Decimal(str(request.data.get("amount", "0")))
        except Exception:
            return Response({"detail": "Invalid amount."}, status=400)
        if amount <= 0:
            return Response({"detail": "Amount must be positive."}, status=400)
        advance.amount_repaid = (advance.amount_repaid or Decimal("0")) + amount
        if advance.amount_repaid >= advance.amount:
            advance.amount_repaid = advance.amount
            advance.status = Advance.Status.CLEARED
        advance.save()
        _resync_advance_payslips(advance.employee, advance.farm)
        return Response(self.get_serializer(advance).data, status=200)


class IncentiveViewSet(EmployeeSelfScopedMixin, FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = Incentive.objects.select_related("employee", "farm").all()
    serializer_class = IncentiveSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["employee", "farm"]
    search_fields = ["reason"]

    def perform_create(self, serializer):
        incentive = serializer.save()
        _sync_payslip(incentive.employee, incentive.farm, incentive.date.month, incentive.date.year)

    def perform_update(self, serializer):
        incentive = serializer.save()
        _sync_payslip(incentive.employee, incentive.farm, incentive.date.month, incentive.date.year)

    def perform_destroy(self, instance):
        employee = instance.employee
        farm = instance.farm
        month = instance.date.month
        year = instance.date.year
        instance.delete()
        _sync_payslip(employee, farm, month, year)


class DeductionViewSet(EmployeeSelfScopedMixin, FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = Deduction.objects.select_related("employee", "farm").all()
    serializer_class = DeductionSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["employee", "farm", "deduction_type"]
    search_fields = ["notes"]

    def perform_create(self, serializer):
        deduction = serializer.save()
        _sync_payslip(deduction.employee, deduction.farm, deduction.date.month, deduction.date.year)

    def perform_update(self, serializer):
        deduction = serializer.save()
        _sync_payslip(deduction.employee, deduction.farm, deduction.date.month, deduction.date.year)

    def perform_destroy(self, instance):
        employee = instance.employee
        farm = instance.farm
        month = instance.date.month
        year = instance.date.year
        instance.delete()
        _sync_payslip(employee, farm, month, year)


class PayslipViewSet(EmployeeSelfScopedMixin, FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = Payslip.objects.select_related("employee", "farm", "period").all()
    serializer_class = PayslipSerializer
    farm_lookup = "farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["employee", "period", "farm", "status"]
    search_fields = ["employee__first_name", "employee__last_name"]

    def perform_update(self, serializer):
        old_status = serializer.instance.status
        payslip = serializer.save()
        # When a payslip is marked PAID (the "Done" action), the account for that
        # month is CLOSED: the Net Pay column shows ₹0 and the Half Pay column keeps
        # showing only the amount the worker actually received as partial pay — we
        # do NOT bump half_paid up to net_pay. Closing simply settles the balance.
        if (
            payslip.status == Payslip.Status.PAID
            and old_status != Payslip.Status.PAID
        ):
            # The advance amount deducted on it is realised as a repayment →
            # clear those advances so they drop out of the Outstanding list.
            self._settle_advances(payslip)
            # Closing the account pays out the leftover balance (net − already
            # part-paid) → record that as a salary expense. Half-pays already
            # expensed their own amount, so we only add the remainder here.
            remaining = (payslip.net_pay or Decimal("0")) - (payslip.half_paid or Decimal("0"))
            _record_salary_expense(
                farm=payslip.farm,
                amount=remaining,
                date=timezone.now().date(),
                description=(
                    f"Salary paid — {payslip.employee.name} "
                    f"({payslip.period.month}/{payslip.period.year})"
                ),
                user=getattr(getattr(self, "request", None), "user", None),
            )

    def _settle_advances(self, payslip):
        remaining = payslip.advance_deduction or Decimal("0")
        advances = Advance.objects.filter(
            employee=payslip.employee,
            farm=payslip.farm,
            status=Advance.Status.OUTSTANDING,
        ).order_by("date")
        for adv in advances:
            balance = adv.balance
            if balance <= 0:
                adv.amount_repaid = adv.amount
                adv.status = Advance.Status.CLEARED
                adv.save(update_fields=["amount_repaid", "status"])
                continue
            if remaining <= 0:
                break
            pay = min(balance, remaining)
            adv.amount_repaid = (adv.amount_repaid or Decimal("0")) + pay
            remaining -= pay
            if adv.amount_repaid >= adv.amount:
                adv.amount_repaid = adv.amount
                adv.status = Advance.Status.CLEARED
            adv.save(update_fields=["amount_repaid", "status"])

    @action(detail=True, methods=["post"])
    def half_pay(self, request, pk=None):
        """Record a partial ("Half Pay") payment against this payslip's net pay.

        The entered amount is added to ``half_paid`` (capped at net pay), so the
        Half Pay column shows the amount paid and the Net Pay column shows the
        remaining balance. When fully paid, the payslip is marked PAID.
        """
        payslip = self.get_object()
        try:
            amount = Decimal(str(request.data.get("amount", "0")))
        except Exception:
            return Response({"detail": "Invalid amount."}, status=400)
        if amount <= 0:
            return Response({"detail": "Amount must be positive."}, status=400)

        net = payslip.net_pay or Decimal("0")
        already = payslip.half_paid or Decimal("0")
        remaining = net - already
        if remaining <= 0:
            return Response(
                {"detail": "This payslip is already fully paid."}, status=400
            )

        applied = min(amount, remaining)
        payslip.half_paid = already + applied
        if payslip.half_paid >= net:
            payslip.half_paid = net
            payslip.status = Payslip.Status.PAID
        payslip.save(update_fields=["half_paid", "status"])
        # This part payment is cash paid out now → record it as a salary expense.
        _record_salary_expense(
            farm=payslip.farm,
            amount=applied,
            date=timezone.now().date(),
            description=(
                f"Salary part payment — {payslip.employee.name} "
                f"({payslip.period.month}/{payslip.period.year})"
            ),
            user=request.user,
        )
        return Response(
            {"applied": applied, "payslip": self.get_serializer(payslip).data},
            status=200,
        )

    @action(detail=False, methods=["get"])
    def monthly_report(self, request):
        """Monthly payroll report: per-employee payslip rows + totals.

        Query params (optional): farm, month, year, employee.

        The Advance column is sourced straight from the Advances page data
        (each employee's outstanding advance balance) instead of the value
        frozen on the payslip, so advances always show for the employee that
        has them — regardless of whether that month's payslips were generated.
        Employees that have an outstanding advance but no payslip for the
        selected period are still listed so their advance is never hidden.
        """
        qs = self.filter_queryset(self.get_queryset())
        farm = request.query_params.get("farm")
        month = request.query_params.get("month")
        year = request.query_params.get("year")
        employee = request.query_params.get("employee")
        if farm:
            qs = qs.filter(farm_id=farm)
        if month:
            qs = qs.filter(period__month=month)
        if year:
            qs = qs.filter(period__year=year)
        if employee:
            qs = qs.filter(employee_id=employee)

        # Outstanding advance balance per employee, from the Advance records
        # (same source as the Advances page). Honours the farm/employee filters
        # and the requesting user's farm scope (super admin sees all farms).
        adv_qs = Advance.objects.filter(status=Advance.Status.OUTSTANDING)
        if request.user.role not in (Role.SUPER_ADMIN,):
            allowed_farm_ids = list(request.user.farms.values_list("id", flat=True))
            adv_qs = adv_qs.filter(farm_id__in=allowed_farm_ids)
        if farm:
            adv_qs = adv_qs.filter(farm_id=farm)
        if employee:
            adv_qs = adv_qs.filter(employee_id=employee)
        advance_by_emp = {}
        for adv in adv_qs.select_related("employee", "employee__farm"):
            bal = adv.balance
            if bal > 0:
                advance_by_emp[adv.employee_id] = (
                    advance_by_emp.get(adv.employee_id, Decimal("0")) + bal
                )

        try:
            m = int(month) if month else None
            y = int(year) if year else None
        except (TypeError, ValueError):
            m, y = None, None

        fields = [
            "gross_wage",
            "overtime_amount",
            "incentive_amount",
            "advance_deduction",
            "other_deductions",
            "net_pay",
        ]
        rows = []
        seen_employees = set()
        for slip in qs:
            seen_employees.add(slip.employee_id)
            data = PayslipSerializer(slip, context={"request": request}).data
            # Always reflect the employee's real outstanding advance and keep
            # the row internally consistent by recomputing Net Pay from it.
            adv = advance_by_emp.get(slip.employee_id, Decimal("0"))
            gross = slip.gross_wage or Decimal("0")
            ot = slip.overtime_amount or Decimal("0")
            inc = slip.incentive_amount or Decimal("0")
            other = slip.other_deductions or Decimal("0")
            data["advance_deduction"] = adv
            data["net_pay"] = gross + ot + inc - adv - other
            rows.append(data)

        # Employees with an outstanding advance but no payslip this period.
        missing_ids = [e for e in advance_by_emp if e not in seen_employees]
        emp_map = {
            e.id: e
            for e in Employee.objects.filter(pk__in=missing_ids).select_related("farm")
        }
        for emp_id in missing_ids:
            emp_obj = emp_map.get(emp_id)
            if not emp_obj:
                continue
            adv = advance_by_emp[emp_id]
            rows.append({
                "employee": emp_id,
                "employee_name": emp_obj.name,
                "farm": emp_obj.farm_id,
                "farm_name": emp_obj.farm.name if emp_obj.farm_id else None,
                "period_month": m,
                "period_year": y,
                "days_worked": Decimal("0"),
                "gross_wage": Decimal("0"),
                "overtime_amount": Decimal("0"),
                "incentive_amount": Decimal("0"),
                "advance_deduction": adv,
                "other_deductions": Decimal("0"),
                "net_pay": -adv,
            })

        totals = {f: Decimal("0") for f in fields}
        for data in rows:
            for f in fields:
                totals[f] += Decimal(str(data.get(f) or "0"))

        return Response({"count": len(rows), "rows": rows, "totals": totals})


class PaymentViewSet(EmployeeSelfScopedMixin, FarmScopedQuerysetMixin, BaseModelViewSet):
    queryset = Payment.objects.select_related("employee", "payslip").all()
    serializer_class = PaymentSerializer
    farm_lookup = "employee__farm_id"
    allowed_roles = [Role.FARM_MANAGER]
    readonly_roles = [Role.EMPLOYEE]
    filterset_fields = ["employee", "payslip", "mode"]
    search_fields = ["reference"]

    def get_queryset(self):
        qs = super().get_queryset()
        # Payment has no direct farm field — the frontend "All Farms" filter
        # sends ?farm=<id>, so map it through the employee's farm.
        farm = self.request.query_params.get("farm")
        if farm:
            qs = qs.filter(employee__farm_id=farm)
        return qs

    @action(detail=False, methods=["get"])
    def history(self, request):
        """Worker payment history: payment records + total paid.

        Query param (optional): employee.
        """
        qs = self.filter_queryset(self.get_queryset())
        employee = request.query_params.get("employee")
        if employee:
            qs = qs.filter(employee_id=employee)
        rows = []
        total = Decimal("0")
        for pay in qs:
            total += pay.amount or Decimal("0")
            rows.append(PaymentSerializer(pay, context={"request": request}).data)
        return Response({"count": len(rows), "rows": rows, "total_paid": total})
