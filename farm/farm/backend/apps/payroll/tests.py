from datetime import date
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.models import Role, User
from apps.farms.models import Farm
from apps.finance.models import Expense
from apps.workforce.models import Attendance, Employee
from apps.payroll.models import Payslip, PayrollPeriod
from apps.payroll.serializers import PayslipSerializer
from apps.payroll.views import AdvanceViewSet, PayrollPeriodViewSet, PayslipViewSet


def _update_status(payslip, new_status):
    """Drive the exact PayslipViewSet.perform_update code path for a status change."""
    view = PayslipViewSet()
    serializer = PayslipSerializer(
        instance=payslip, data={"status": new_status}, partial=True
    )
    serializer.is_valid(raise_exception=True)
    view.perform_update(serializer)
    payslip.refresh_from_db()
    return payslip


class PayslipDoneAutoBalanceTests(TestCase):
    def setUp(self):
        self.farm = Farm.objects.create(name="Test Farm", code="TF1")
        self.employee = Employee.objects.create(
            employee_code="E1", first_name="Ram", last_name="Kumar", farm=self.farm
        )
        self.period = PayrollPeriod.objects.create(farm=self.farm, month=7, year=2026)

    def _make_slip(self, **kwargs):
        return Payslip.objects.create(
            employee=self.employee,
            period=self.period,
            farm=self.farm,
            net_pay=Decimal("1000"),
            **kwargs,
        )

    def test_marking_done_keeps_actual_half_pay(self):
        # Closing the account (Done) must NOT bump half_paid up to net_pay —
        # the Half Pay column keeps showing only what the worker actually got.
        slip = self._make_slip(status=Payslip.Status.DRAFT, half_paid=Decimal("400"))
        self.assertEqual(slip.net_remaining, Decimal("600"))

        slip = _update_status(slip, Payslip.Status.PAID)

        self.assertEqual(slip.status, Payslip.Status.PAID)
        self.assertEqual(slip.half_paid, Decimal("400"))

    def test_marking_done_with_no_half_pay_stays_zero(self):
        slip = self._make_slip(status=Payslip.Status.DRAFT)

        slip = _update_status(slip, Payslip.Status.PAID)

        self.assertEqual(slip.status, Payslip.Status.PAID)
        self.assertEqual(slip.half_paid, Decimal("0"))

    def test_marking_due_again_preserves_actual_half_pay(self):
        slip = self._make_slip(status=Payslip.Status.DRAFT, half_paid=Decimal("400"))
        slip = _update_status(slip, Payslip.Status.PAID)
        self.assertEqual(slip.half_paid, Decimal("400"))

        slip = _update_status(slip, Payslip.Status.DRAFT)

        self.assertEqual(slip.status, Payslip.Status.DRAFT)
        self.assertEqual(slip.half_paid, Decimal("400"))
        self.assertEqual(slip.net_remaining, Decimal("600"))


class PayslipGenerationAbsenceTests(TestCase):
    """Pay is per-day: one day's salary (monthly ÷ calendar days) per day
    present, half for a half day, nothing for an absent day."""

    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin", password="x", role=Role.SUPER_ADMIN
        )
        self.farm = Farm.objects.create(name="Gen Farm", code="FGEN")
        # July 2026 has 31 days → daily rate = 31000 / 31 = ₹1,000.
        self.employee = Employee.objects.create(
            employee_code="EG",
            first_name="A",
            last_name="B",
            farm=self.farm,
            monthly_salary=Decimal("31000"),
        )
        self.period = PayrollPeriod.objects.create(farm=self.farm, month=7, year=2026)

    def _attendance(self, day, status):
        Attendance.objects.create(
            employee=self.employee,
            farm=self.farm,
            date=date(2026, 7, day),
            status=status,
            approval_status=Attendance.ApprovalStatus.APPROVED,
        )

    def _generate(self):
        factory = APIRequestFactory()
        request = factory.post(f"/api/payroll/periods/{self.period.id}/generate/")
        force_authenticate(request, user=self.admin)
        view = PayrollPeriodViewSet.as_view({"post": "generate"})
        return view(request, pk=str(self.period.id))

    def _slip(self):
        return Payslip.objects.get(employee=self.employee, period=self.period)

    def test_absent_days_are_not_paid(self):
        for d in range(1, 21):
            self._attendance(d, Attendance.Status.PRESENT)
        self._attendance(21, Attendance.Status.ABSENT)
        self._attendance(22, Attendance.Status.ABSENT)

        resp = self._generate()
        self.assertEqual(resp.status_code, 200, getattr(resp, "data", None))

        slip = self._slip()
        self.assertEqual(slip.days_worked, Decimal("20"))
        self.assertEqual(slip.gross_wage, Decimal("20000"))  # 20 × 1000
        self.assertEqual(slip.net_pay, Decimal("20000"))

    def test_half_day_earns_half(self):
        for d in range(1, 21):
            self._attendance(d, Attendance.Status.PRESENT)
        self._attendance(21, Attendance.Status.HALF_DAY)

        resp = self._generate()
        self.assertEqual(resp.status_code, 200, getattr(resp, "data", None))

        slip = self._slip()
        self.assertEqual(slip.days_worked, Decimal("20.5"))
        self.assertEqual(slip.gross_wage, Decimal("20500"))  # 20.5 × 1000

    def test_full_month_present_pays_full_monthly(self):
        for d in range(1, 32):  # present every day of a 31-day month
            self._attendance(d, Attendance.Status.PRESENT)

        resp = self._generate()
        self.assertEqual(resp.status_code, 200, getattr(resp, "data", None))

        self.assertEqual(self._slip().gross_wage, Decimal("31000"))  # 31 × 1000

    def test_pending_attendance_is_counted(self):
        # Attendance counts as soon as it is marked — no separate approval
        # needed. A pending present day still earns a day's pay.
        Attendance.objects.create(
            employee=self.employee, farm=self.farm, date=date(2026, 7, 1),
            status=Attendance.Status.PRESENT,
            approval_status=Attendance.ApprovalStatus.PENDING,
        )

        resp = self._generate()
        self.assertEqual(resp.status_code, 200, getattr(resp, "data", None))

        slip = self._slip()
        self.assertEqual(slip.days_worked, Decimal("1"))
        self.assertEqual(slip.gross_wage, Decimal("1000"))  # 1 × 1000

    def test_rejected_attendance_is_not_counted(self):
        Attendance.objects.create(
            employee=self.employee, farm=self.farm, date=date(2026, 7, 1),
            status=Attendance.Status.PRESENT,
            approval_status=Attendance.ApprovalStatus.REJECTED,
        )

        resp = self._generate()
        self.assertEqual(resp.status_code, 200, getattr(resp, "data", None))

        self.assertEqual(self._slip().days_worked, Decimal("0"))

    def test_attendance_at_another_assigned_farm_still_counts(self):
        # A worker assigned to several farms may check in at any of them. Their
        # day must still count on their home-farm payslip even though it was
        # recorded against a different farm's geofence.
        other = Farm.objects.create(name="Other Farm", code="FOTH")
        Attendance.objects.create(
            employee=self.employee, farm=other, date=date(2026, 7, 1),
            status=Attendance.Status.HALF_DAY,
            approval_status=Attendance.ApprovalStatus.APPROVED,
        )

        resp = self._generate()
        self.assertEqual(resp.status_code, 200, getattr(resp, "data", None))

        slip = self._slip()
        self.assertEqual(slip.days_worked, Decimal("0.5"))
        self.assertEqual(slip.gross_wage, Decimal("500"))  # 0.5 × 1000

    def test_checked_out_full_day_counts_as_present(self):
        # A worker who checked out after a full day (PRESENT_DONE) counts as a
        # full worked day, same as a still-checked-in PRESENT day.
        for d in range(1, 20):
            self._attendance(d, Attendance.Status.PRESENT)
        self._attendance(20, Attendance.Status.PRESENT_DONE)

        resp = self._generate()
        self.assertEqual(resp.status_code, 200, getattr(resp, "data", None))

        slip = self._slip()
        self.assertEqual(slip.days_worked, Decimal("20"))
        self.assertEqual(slip.gross_wage, Decimal("20000"))  # 20 × 1000

    def test_half_day_checkout_earns_half_salary(self):
        # Under-5h check-out → HALF_DAY → half a day's pay (₹1,000/day → ₹500),
        # and days_worked counts it as 0.5.
        for d in range(1, 20):
            self._attendance(d, Attendance.Status.PRESENT)
        self._attendance(20, Attendance.Status.HALF_DAY)

        resp = self._generate()
        self.assertEqual(resp.status_code, 200, getattr(resp, "data", None))

        slip = self._slip()
        self.assertEqual(slip.days_worked, Decimal("19.5"))
        self.assertEqual(slip.gross_wage, Decimal("19500"))  # 19.5 × 1000


class PayslipGenerationHourlyTests(TestCase):
    """Hourly-wage employees are paid rate × hours actually worked."""

    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin", password="x", role=Role.SUPER_ADMIN
        )
        self.farm = Farm.objects.create(name="Hourly Farm", code="FHR")
        # ₹100/hour hourly-wage worker.
        self.employee = Employee.objects.create(
            employee_code="EH",
            first_name="H",
            last_name="W",
            farm=self.farm,
            wage_type=Employee.WageType.HOURLY,
            hourly_wage=Decimal("100"),
        )
        self.period = PayrollPeriod.objects.create(farm=self.farm, month=7, year=2026)

    def _attendance(self, day, seconds):
        Attendance.objects.create(
            employee=self.employee,
            farm=self.farm,
            date=date(2026, 7, day),
            status=Attendance.Status.PRESENT,
            approval_status=Attendance.ApprovalStatus.APPROVED,
            working_seconds=seconds,
        )

    def _generate(self):
        factory = APIRequestFactory()
        request = factory.post(f"/api/payroll/periods/{self.period.id}/generate/")
        force_authenticate(request, user=self.admin)
        view = PayrollPeriodViewSet.as_view({"post": "generate"})
        return view(request, pk=str(self.period.id))

    def test_gross_is_rate_times_hours(self):
        self._attendance(1, 8 * 3600)   # 8 hours
        self._attendance(2, 5 * 3600)   # 5 hours → 13 hours total

        resp = self._generate()
        self.assertEqual(resp.status_code, 200, getattr(resp, "data", None))

        slip = Payslip.objects.get(employee=self.employee, period=self.period)
        # 13 hours × ₹100 = ₹1,300
        self.assertEqual(slip.gross_wage, Decimal("1300"))
        self.assertEqual(slip.net_pay, Decimal("1300"))


class SalaryExpenseAutoEntryTests(TestCase):
    """Advances, part-payments and payslip closures auto-record a LABOUR
    expense in Financial Management (salary is an operating expense)."""

    def setUp(self):
        self.admin = User.objects.create_user(
            username="expadmin", password="x", role=Role.SUPER_ADMIN
        )
        self.farm = Farm.objects.create(name="Exp Farm", code="FEXP")
        self.employee = Employee.objects.create(
            employee_code="EX", first_name="A", last_name="B", farm=self.farm
        )
        self.period = PayrollPeriod.objects.create(farm=self.farm, month=7, year=2026)
        self.factory = APIRequestFactory()

    def _labour_expenses(self):
        return Expense.objects.filter(farm=self.farm, category=Expense.Category.LABOUR)

    def test_advance_creates_expense(self):
        request = self.factory.post("/api/payroll/advances/", {
            "employee": str(self.employee.id),
            "farm": str(self.farm.id),
            "amount": "500",
            "date": "2026-07-05",
        })
        force_authenticate(request, user=self.admin)
        resp = AdvanceViewSet.as_view({"post": "create"})(request)
        self.assertIn(resp.status_code, (200, 201), getattr(resp, "data", None))
        self.assertEqual(self._labour_expenses().count(), 1)
        self.assertEqual(self._labour_expenses().first().amount, Decimal("500"))

    def test_half_pay_creates_expense_for_applied_amount(self):
        slip = Payslip.objects.create(
            employee=self.employee, period=self.period, farm=self.farm,
            net_pay=Decimal("1000"),
        )
        request = self.factory.post(
            f"/api/payroll/payslips/{slip.id}/half_pay/", {"amount": "400"}
        )
        force_authenticate(request, user=self.admin)
        resp = PayslipViewSet.as_view({"post": "half_pay"})(request, pk=str(slip.id))
        self.assertEqual(resp.status_code, 200, getattr(resp, "data", None))
        self.assertEqual(self._labour_expenses().count(), 1)
        self.assertEqual(self._labour_expenses().first().amount, Decimal("400"))

    def test_close_expenses_only_remaining_balance(self):
        # 1000 net with 400 already part-paid → closing expenses only the 600
        # leftover, so half-pay + close together sum to net (no double count).
        slip = Payslip.objects.create(
            employee=self.employee, period=self.period, farm=self.farm,
            net_pay=Decimal("1000"), half_paid=Decimal("400"),
            status=Payslip.Status.DRAFT,
        )
        view = PayslipViewSet()
        request = self.factory.patch(f"/api/payroll/payslips/{slip.id}/", {"status": "PAID"})
        force_authenticate(request, user=self.admin)
        request.user = self.admin
        view.request = request
        serializer = PayslipSerializer(instance=slip, data={"status": "PAID"}, partial=True)
        serializer.is_valid(raise_exception=True)
        view.perform_update(serializer)
        self.assertEqual(self._labour_expenses().count(), 1)
        self.assertEqual(self._labour_expenses().first().amount, Decimal("600"))
