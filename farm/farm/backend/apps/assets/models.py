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
    purchase_date = models.DateField(null=True, blank=True)
    purchase_cost = models.DecimalField(max_digits=14, decimal_places=2, default=0)
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
