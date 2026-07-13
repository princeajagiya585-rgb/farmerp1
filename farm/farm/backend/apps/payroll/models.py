from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models

from apps.core.models import OwnedModel


class PayrollPeriod(OwnedModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        GENERATED = "GENERATED", "Generated"
        PAID = "PAID", "Paid"

    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="payroll_periods"
    )
    month = models.IntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(12)]
    )
    year = models.IntegerField()
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    generated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-year", "-month"]
        unique_together = ("farm", "month", "year")

    def __str__(self):
        return f"{self.farm.name} - {self.month}/{self.year}"


class Advance(OwnedModel):
    class Status(models.TextChoices):
        OUTSTANDING = "OUTSTANDING", "Outstanding"
        CLEARED = "CLEARED", "Cleared"

    employee = models.ForeignKey(
        "workforce.Employee", on_delete=models.CASCADE, related_name="advances"
    )
    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="advances"
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    date = models.DateField()
    reason = models.TextField(blank=True)
    amount_repaid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.OUTSTANDING
    )

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.employee.name} - {self.amount} ({self.status})"

    @property
    def balance(self):
        return self.amount - self.amount_repaid


class Incentive(OwnedModel):
    employee = models.ForeignKey(
        "workforce.Employee", on_delete=models.CASCADE, related_name="incentives"
    )
    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="incentives"
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reason = models.TextField(blank=True)
    date = models.DateField()

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.employee.name} - {self.amount}"


class Deduction(OwnedModel):
    class DeductionType(models.TextChoices):
        PF = "PF", "Provident Fund"
        ESI = "ESI", "ESI"
        LOAN = "LOAN", "Loan"
        OTHER = "OTHER", "Other"

    employee = models.ForeignKey(
        "workforce.Employee", on_delete=models.CASCADE, related_name="deductions"
    )
    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="deductions"
    )
    deduction_type = models.CharField(
        max_length=20, choices=DeductionType.choices, default=DeductionType.OTHER
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    date = models.DateField()
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.employee.name} - {self.deduction_type} {self.amount}"


class Payslip(OwnedModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        FINALIZED = "FINALIZED", "Finalized"
        PAID = "PAID", "Paid"

    employee = models.ForeignKey(
        "workforce.Employee", on_delete=models.CASCADE, related_name="payslips"
    )
    period = models.ForeignKey(
        PayrollPeriod, on_delete=models.CASCADE, related_name="payslips"
    )
    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="payslips"
    )
    days_worked = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    overtime_hours = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    gross_wage = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    overtime_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    incentive_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    advance_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    other_deductions = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_pay = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Amount already paid out via partial ("Half Pay") payments.
    half_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Optional bill/receipt photo for the payout — e.g. a screenshot of an
    # online transaction. Optional because some payouts are made in cash.
    payment_photo = models.ImageField(
        upload_to="payslips/", null=True, blank=True,
        help_text="Optional bill/receipt photo for the payout (online transaction proof)",
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )

    @property
    def net_remaining(self):
        return (self.net_pay or 0) - (self.half_paid or 0)

    class Meta:
        ordering = ["-created_at"]
        unique_together = ("employee", "period")

    def __str__(self):
        return f"{self.employee.name} - {self.period} ({self.net_pay})"


class Payment(OwnedModel):
    class Mode(models.TextChoices):
        CASH = "CASH", "Cash"
        BANK = "BANK", "Bank"
        UPI = "UPI", "UPI"
        CHEQUE = "CHEQUE", "Cheque"

    payslip = models.ForeignKey(
        Payslip,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments",
    )
    employee = models.ForeignKey(
        "workforce.Employee", on_delete=models.CASCADE, related_name="payments"
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    date = models.DateField()
    mode = models.CharField(max_length=20, choices=Mode.choices, default=Mode.CASH)
    reference = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.employee.name} - {self.amount} ({self.mode})"
