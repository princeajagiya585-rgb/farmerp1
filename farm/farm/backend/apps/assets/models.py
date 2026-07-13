from datetime import date
from decimal import Decimal

from django.db import models

from apps.core.models import OwnedModel


class Asset(OwnedModel):
    """A farm asset — machinery, equipment, vehicle, tool or infrastructure."""

    class AssetType(models.TextChoices):
        MACHINERY = "MACHINERY", "Machinery"
        EQUIPMENT = "EQUIPMENT", "Equipment"
        VEHICLE = "VEHICLE", "Vehicle"
        TOOL = "TOOL", "Tool"
        IRRIGATION = "IRRIGATION", "Irrigation"
        INFRASTRUCTURE = "INFRASTRUCTURE", "Infrastructure"
        OTHER = "OTHER", "Other"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        IDLE = "IDLE", "Idle"
        UNDER_REPAIR = "UNDER_REPAIR", "Under Repair"
        RETIRED = "RETIRED", "Retired"

    class WarrantyType(models.TextChoices):
        GUARANTY = "GUARANTY", "Guaranty"
        WARRANTY = "WARRANTY", "Warranty"

    class DepreciationPeriod(models.TextChoices):
        DAY = "DAY", "Per Day"
        MONTH = "MONTH", "Per Month"
        YEAR = "YEAR", "Per Year"

    # Asset types treated as "equipment & machinery" for that sub-module view.
    EQUIPMENT_KINDS = [AssetType.MACHINERY, AssetType.EQUIPMENT, AssetType.VEHICLE]

    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="assets"
    )
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=50, blank=True)
    asset_type = models.CharField(
        max_length=20, choices=AssetType.choices, default=AssetType.MACHINERY
    )
    manufacturer = models.CharField(max_length=120, blank=True)
    model_number = models.CharField(max_length=120, blank=True)
    serial_number = models.CharField(max_length=120, blank=True)
    warranty_type = models.CharField(
        max_length=20, choices=WarrantyType.choices, blank=True,
        help_text="Whether the asset is covered by a guaranty or a warranty",
    )
    warranty_years = models.DecimalField(
        max_digits=4, decimal_places=1, null=True, blank=True,
        help_text="Length of the guaranty/warranty in years",
    )
    purchase_date = models.DateField(null=True, blank=True)
    purchase_cost = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    depreciation_period = models.CharField(
        max_length=10, choices=DepreciationPeriod.choices, blank=True,
        help_text="Depreciate the asset per day, month or year",
    )
    depreciation_percent = models.DecimalField(
        max_digits=6, decimal_places=2, default=0,
        help_text="Percent of purchase cost lost each depreciation period",
    )
    current_value = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE
    )
    assigned_to = models.ForeignKey(
        "workforce.Employee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_assets",
    )
    photo = models.ImageField(upload_to="assets/", null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.get_asset_type_display()})"

    def computed_current_value(self, as_of=None):
        """Current value after straight-line depreciation.

        Each depreciation period (day / month / year) since the purchase date
        subtracts ``depreciation_percent`` of the purchase cost. e.g. a ₹13,000
        asset depreciating 2% per day loses ₹260/day, so after N days it is
        worth ₹13,000 − 260×N (never below 0). When depreciation isn't
        configured the stored current value (or the purchase cost) is kept.
        """
        cost = self.purchase_cost or Decimal("0")
        pct = self.depreciation_percent or Decimal("0")
        if not self.purchase_date or not self.depreciation_period or pct <= 0:
            return self.current_value if self.current_value else cost

        as_of = as_of or date.today()
        if as_of <= self.purchase_date:
            return cost

        pd = self.purchase_date
        if self.depreciation_period == self.DepreciationPeriod.DAY:
            periods = (as_of - pd).days
        elif self.depreciation_period == self.DepreciationPeriod.MONTH:
            periods = (as_of.year - pd.year) * 12 + (as_of.month - pd.month)
            if as_of.day < pd.day:
                periods -= 1
        elif self.depreciation_period == self.DepreciationPeriod.YEAR:
            periods = as_of.year - pd.year
            if (as_of.month, as_of.day) < (pd.month, pd.day):
                periods -= 1
        else:
            return cost
        periods = max(0, periods)

        per_period = cost * pct / Decimal("100")
        value = cost - per_period * periods
        return value if value > 0 else Decimal("0")


class AssetMaintenance(OwnedModel):
    """A service / repair / inspection record against an asset."""

    class MaintenanceType(models.TextChoices):
        SERVICE = "SERVICE", "Service"
        REPAIR = "REPAIR", "Repair"
        INSPECTION = "INSPECTION", "Inspection"
        OTHER = "OTHER", "Other"

    asset = models.ForeignKey(
        Asset, on_delete=models.CASCADE, related_name="maintenance_logs"
    )
    date = models.DateField()
    maintenance_type = models.CharField(
        max_length=20, choices=MaintenanceType.choices, default=MaintenanceType.SERVICE
    )
    description = models.TextField()
    cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    performed_by = models.CharField(max_length=150, blank=True)
    next_due_date = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.get_maintenance_type_display()} — {self.asset.name} ({self.date})"
