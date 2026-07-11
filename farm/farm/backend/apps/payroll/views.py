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

    # Recalculate advance deduction from all outstanding advances
    gross_total = gross_wage + overtime_amount + incentive_amount
    available = gross_total - other_deductions
    advance_deduction = Decimal("0")
    period_end = date(year, month, monthrange(year, month)[1])
    for adv in Advance.objects.filter(
        employee=employee,
        farm=farm,
        status=Advance.Status.OUTSTANDING,
        date__lte=period_end,  # don't deduct advances dated after this period
    ):
        if available <= 0:
            break
        balance = adv.balance
        if balance <= 0:
            continue
        deduct = min(balance, available)
        advance_deduction += deduct
        available -= deduct

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
                attendances = Attendance.objects.filter(
                    employee=employee,
                    farm=period.farm,
                    date__month=period.month,
                    date__year=period.year,
                    approval_status=Attendance.ApprovalStatus.APPROVED,
                )

                days_worked = Decimal("0")
                absent_days = Decimal("0")
                overtime_hours = Decimal("0")
                for att in attendances:
                    if att.status == Attendance.Status.PRESENT:
                        days_worked += Decimal("1")
                    elif att.status == Attendance.Status.HALF_DAY:
                        days_worked += Decimal("0.5")
                        # Half day → half a day's salary is cut for a monthly wage.
                        absent_days += Decimal("0.5")
                    elif att.status == Attendance.Status.ABSENT:
                        absent_days += Decimal("1")
                    overtime_hours += att.overtime_hours or Decimal("0")

                daily_wage = employee.daily_wage or Decimal("0")
                monthly_salary = employee.monthly_salary or Decimal("0")
                # Days in this payroll month — one day's salary = monthly ÷ this.
                days_in_month = Decimal(
                    monthrange(period.year, period.month)[1]
                )
                # If monthly_salary is set, it is the base wage, but each absent
                # day cuts one day's salary (monthly ÷ days-in-month). Only fall
                # back to daily_wage × days_worked when monthly_salary is not set.
                if monthly_salary > 0:
                    daily_rate = monthly_salary / days_in_month
                    gross_wage = monthly_salary - (absent_days * daily_rate)
                    if gross_wage < 0:
                        gross_wage = Decimal("0")
                elif daily_wage > 0:
                    gross_wage = days_worked * daily_wage
                else:
                    gross_wage = monthly_salary
                # Effective daily rate for overtime (≈1/30 of salary if no day rate)
                effective_daily = daily_wage if daily_wage > 0 else (monthly_salary / Decimal("30")) if monthly_salary > 0 else Decimal("0")
                overtime_amount = overtime_hours * (effective_daily / Decimal("8"))

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

                # Outstanding advances: deduct up to remaining balance
                gross_total = gross_wage + overtime_amount + incentive_amount
                available = gross_total - other_deductions
                advance_deduction = Decimal("0")
                period_end = date(period.year, period.month, monthrange(period.year, period.month)[1])
                outstanding = Advance.objects.filter(
                    employee=employee,
                    farm=period.farm,
                    status=Advance.Status.OUTSTANDING,
                    date__lte=period_end,  # ignore advances dated after this period
                )
                for adv in outstanding:
                    if available <= 0:
                        break
                    balance = adv.balance
                    if balance <= 0:
                        continue
                    deduct = min(balance, available)
                    advance_deduction += deduct
                    available -= deduct

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
        _sync_payslip(advance.employee, advance.farm, advance.date.month, advance.date.year)

    def perform_update(self, serializer):
        advance = serializer.save()
        self._sync_status(advance)
        _sync_payslip(advance.employee, advance.farm, advance.date.month, advance.date.year)

    def perform_destroy(self, instance):
        employee = instance.employee
        farm = instance.farm
        month = instance.date.month
        year = instance.date.year
        instance.delete()
        _sync_payslip(employee, farm, month, year)

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
        _sync_payslip(advance.employee, advance.farm, advance.date.month, advance.date.year)
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
        return Response(
            {"applied": applied, "payslip": self.get_serializer(payslip).data},
            status=200,
        )

    @action(detail=False, methods=["get"])
    def monthly_report(self, request):
        """Monthly payroll report: per-employee payslip rows + totals.

        Query params (optional): farm, month, year, employee.
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

        fields = [
            "gross_wage",
            "overtime_amount",
            "incentive_amount",
            "advance_deduction",
            "other_deductions",
            "net_pay",
        ]
        totals = {f: Decimal("0") for f in fields}
        rows = []
        for slip in qs:
            for f in fields:
                totals[f] += getattr(slip, f) or Decimal("0")
            rows.append(PayslipSerializer(slip, context={"request": request}).data)

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
