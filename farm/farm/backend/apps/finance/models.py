from django.conf import settings
from django.db import models

from apps.core.models import OwnedModel, TimeStampedModel


class Expense(OwnedModel):
    class Category(models.TextChoices):
        LABOUR = "LABOUR", "Labour"
        INPUTS = "INPUTS", "Inputs"
        FUEL = "FUEL", "Fuel"
        MAINTENANCE = "MAINTENANCE", "Maintenance"
        UTILITIES = "UTILITIES", "Utilities"
        TRANSPORT = "TRANSPORT", "Transport"
        ASSET = "ASSET", "Asset"
        MISC = "MISC", "Miscellaneous"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="expenses"
    )
    category = models.CharField(
        max_length=15, choices=Category.choices, default=Category.MISC
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    date = models.DateField()
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_expenses",
    )
    cost_center = models.ForeignKey(
        "CostCenter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expenses",
    )
    crop = models.ForeignKey(
        "agronomy.Crop",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expenses",
    )
    is_paid = models.BooleanField(default=False)
    bill_file = models.FileField(upload_to="finance/bills/expenses/", blank=True)
    # Link to the source record when this expense was auto-mirrored from another
    # module (e.g. a purchase, an asset, a salary payout). Blank for expenses
    # created directly on the Expenses page.
    source_type = models.CharField(max_length=32, blank=True)
    source_id = models.CharField(max_length=64, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["source_type", "source_id"])]

    def __str__(self):
        return f"{self.category} - {self.amount} ({self.date})"


class Purchase(OwnedModel):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="purchases"
    )
    invoice_no = models.CharField(max_length=100, blank=True)
    date = models.DateField()
    quantity = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    unit = models.CharField(max_length=30, blank=True)
    unit_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_purchases",
    )
    is_paid = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    bill_file = models.FileField(upload_to="finance/bills/purchases/", blank=True)
    employee = models.ForeignKey(
        "workforce.Employee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="purchases",
    )

    def __str__(self):
        return f"{self.invoice_no or 'Purchase'} - {self.total_amount}"


class PurchaseItem(TimeStampedModel):
    purchase = models.ForeignKey(
        Purchase, on_delete=models.CASCADE, related_name="items"
    )
    inventory_item = models.ForeignKey(
        "inventory.Item",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    unit_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    def __str__(self):
        return f"{self.name} x {self.quantity}"


class LedgerEntry(OwnedModel):
    class EntryType(models.TextChoices):
        DEBIT = "DEBIT", "Debit"
        CREDIT = "CREDIT", "Credit"

    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="ledger_entries"
    )
    entry_type = models.CharField(max_length=10, choices=EntryType.choices)
    account = models.CharField(
        max_length=255, blank=True, help_text="account head"
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    date = models.DateField()
    reference = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    source_type = models.CharField(max_length=100, blank=True)
    source_id = models.CharField(max_length=64, blank=True)

    def __str__(self):
        return f"{self.entry_type} {self.amount} ({self.account})"


class Payment(OwnedModel):
    class Mode(models.TextChoices):
        CASH = "CASH", "Cash"
        BANK = "BANK", "Bank"
        UPI = "UPI", "UPI"
        CHEQUE = "CHEQUE", "Cheque"

    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="finance_payments"
    )
    expense = models.ForeignKey(
        Expense,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments",
    )
    purchase = models.ForeignKey(
        Purchase,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments",
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    date = models.DateField()
    mode = models.CharField(
        max_length=10, choices=Mode.choices, default=Mode.BANK
    )
    reference = models.CharField(max_length=255, blank=True)
    is_advance = models.BooleanField(
        default=False, help_text="Advance payment"
    )
    bill_file = models.FileField(upload_to="finance/bills/payments/", blank=True)
    employee = models.ForeignKey(
        "workforce.Employee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="finance_payments",
    )

    def __str__(self):
        return f"{self.mode} {self.amount} ({self.date})"


class RevenueEntry(OwnedModel):
    class Source(models.TextChoices):
        HARVEST_SALE = "HARVEST_SALE", "Harvest Sale"
        SUBSIDY = "SUBSIDY", "Subsidy"
        OTHER = "OTHER", "Other"

    class Category(models.TextChoices):
        CROP_SALE = "CROP_SALE", "Crop / Harvest Sale"
        LIVESTOCK = "LIVESTOCK", "Livestock / Dairy"
        SUBSIDY = "SUBSIDY", "Subsidy"
        RENT = "RENT", "Rent / Lease"
        EQUIPMENT_SALE = "EQUIPMENT_SALE", "Equipment Sale"
        OTHER = "OTHER", "Other"

    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="revenues"
    )
    source = models.CharField(
        max_length=15, choices=Source.choices, default=Source.HARVEST_SALE
    )
    category = models.CharField(
        max_length=20, choices=Category.choices, default=Category.CROP_SALE
    )
    name = models.CharField(
        max_length=255, blank=True, help_text="Label for this income entry"
    )
    crop = models.ForeignKey(
        "agronomy.Crop",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="revenue_entries",
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    date = models.DateField()
    description = models.TextField(blank=True)
    # Link to the source record when this revenue was auto-mirrored from another
    # module (e.g. a sale). Blank for revenue created on the Revenue page.
    source_type = models.CharField(max_length=32, blank=True)
    source_id = models.CharField(max_length=64, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["source_type", "source_id"])]

    def __str__(self):
        return f"{self.category} {self.amount} ({self.date})"


class CostCenter(OwnedModel):
    """A cost center for grouping and budgeting expenses within a farm."""

    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="cost_centers"
    )
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=30, blank=True)
    description = models.TextField(blank=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    bill_file = models.FileField(upload_to="finance/bills/costcenters/", blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.farm.name})"


class Budget(OwnedModel):
    """A budget allocation for a farm / cost center / category over a period."""

    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="budgets"
    )
    cost_center = models.ForeignKey(
        CostCenter,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="budgets",
    )
    category = models.CharField(
        max_length=15, choices=Expense.Category.choices, blank=True
    )
    fiscal_year = models.IntegerField()
    month = models.IntegerField(
        null=True, blank=True, help_text="1-12, or blank for the whole year"
    )
    allocated_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=0
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-fiscal_year", "-month"]

    def __str__(self):
        return f"Budget {self.allocated_amount} ({self.fiscal_year})"

    @property
    def spent(self):
        from django.db.models import Sum

        # Safety check for valid fiscal year
        if not (1 <= self.fiscal_year <= 9999):
            return 0

        qs = Expense.objects.filter(
            farm_id=self.farm_id,
            status=Expense.Status.APPROVED,
            date__year=self.fiscal_year,
        )
        if self.month:
            qs = qs.filter(date__month=self.month)
        if self.cost_center_id:
            qs = qs.filter(cost_center_id=self.cost_center_id)
        elif self.category:
            qs = qs.filter(category=self.category)
        return qs.aggregate(s=Sum("amount"))["s"] or 0

    @property
    def remaining(self):
        return self.allocated_amount - self.spent


class Sale(OwnedModel):
    """A sales record — produce sold, with optional crop link for profitability."""

    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="sales"
    )
    crop = models.ForeignKey(
        "agronomy.Crop",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sales",
    )
    name = models.CharField(
        max_length=255, blank=True, help_text="Label for this sale"
    )
    buyer = models.CharField(max_length=255, blank=True)
    quantity = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    unit = models.CharField(max_length=30, blank=True)
    unit_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    date = models.DateField()
    notes = models.TextField(blank=True)
    bill_file = models.FileField(upload_to="finance/bills/sales/", blank=True)
    employee = models.ForeignKey(
        "workforce.Employee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sales",
    )

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"Sale {self.amount} ({self.date})"
