from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class Farm(TimeStampedModel):
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=30, unique=True)
    location = models.CharField(max_length=255, blank=True)
    latitude = models.DecimalField(max_digits=20, decimal_places=15, null=True, blank=True)
    longitude = models.DecimalField(max_digits=20, decimal_places=15, null=True, blank=True)
    total_area = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text="In acres")
    geofence = models.JSONField(default=list, blank=True, help_text="List of [lat, lng] polygon points")
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="managed_farms",
    )
    established_date = models.DateField(null=True, blank=True)
    soil_type = models.CharField(max_length=100, blank=True)
    climate_zone = models.CharField(max_length=100, blank=True)
    irrigation_type = models.CharField(max_length=100, blank=True)
    check_in_radius = models.IntegerField(default=100, help_text="Radius in meters for GPS check-in validation. Default 100m")
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.code})"

    @property
    def farm_id(self):
        return self.id

    @property
    def field_count(self):
        return self.fields.count()

    @property
    def active_crop_count(self):
        from apps.agronomy.models import Crop
        return Crop.objects.filter(farm=self, status__in=[
            Crop.Status.PLANNED, Crop.Status.PLANTED, Crop.Status.GROWING
        ]).count()

    @property
    def employee_count(self):
        return self.employees.count()

    @property
    def asset_count(self):
        return self.assets.count()


class Field(TimeStampedModel):
    """A plot / block / field within a farm."""

    class FieldType(models.TextChoices):
        PLOT = "PLOT", "Plot"
        BLOCK = "BLOCK", "Block"
        SECTION = "SECTION", "Section"

    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name="fields")
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=30, blank=True)
    block_name = models.CharField(max_length=150, blank=True, help_text="Block / section name within the field")
    field_type = models.CharField(
        max_length=20, choices=FieldType.choices, default=FieldType.PLOT
    )
    area = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text="In acres")
    soil_type = models.CharField(max_length=100, blank=True)
    soil_ph = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    slope = models.CharField(max_length=50, blank=True, help_text="e.g. Flat, Gentle, Steep")
    irrigation_source = models.CharField(max_length=100, blank=True)
    geofence = models.JSONField(default=list, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["farm", "name"]

    def __str__(self):
        return f"{self.name} @ {self.farm.name}"

    @property
    def current_crop(self):
        from apps.agronomy.models import Crop
        crop = Crop.objects.filter(
            field=self,
            status__in=[Crop.Status.PLANTED, Crop.Status.GROWING]
        ).first()
        return crop.name if crop else None

    @property
    def crop_history(self):
        from apps.agronomy.models import Crop
        return list(Crop.objects.filter(field=self).values("name", "variety", "season", "status", "planting_date"))


class FarmDocument(TimeStampedModel):
    """Documents and records attached to a farm for historical tracking."""

    class DocType(models.TextChoices):
        DEED = "DEED", "Land Deed"
        SURVEY = "SURVEY", "Survey Report"
        SOIL_TEST = "SOIL_TEST", "Soil Test Report"
        WATER_TEST = "WATER_TEST", "Water Test Report"
        LEASE = "LEASE", "Lease Agreement"
        MAP = "MAP", "Plot Map"
        PHOTO = "PHOTO", "Farm Photo"
        CERTIFICATE = "CERTIFICATE", "Certificate"
        OTHER = "OTHER", "Other"

    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name="farm_documents")
    title = models.CharField(max_length=255)
    doc_type = models.CharField(max_length=20, choices=DocType.choices, default=DocType.OTHER)
    document = models.FileField(upload_to="farm_documents/")
    description = models.TextField(blank=True)
    issue_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="farm_document_uploads",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({self.get_doc_type_display()})"


class FarmHistory(TimeStampedModel):
    """Historical record of significant events/changes on a farm."""

    class EventType(models.TextChoices):
        CREATED = "CREATED", "Farm Created"
        FIELD_ADDED = "FIELD_ADDED", "Field/Plot Added"
        CROP_PLANTED = "CROP_PLANTED", "Crop Planted"
        CROP_HARVESTED = "CROP_HARVESTED", "Crop Harvested"
        MANAGER_CHANGED = "MANAGER_CHANGED", "Manager Changed"
        AREA_UPDATED = "AREA_UPDATED", "Area Updated"
        EQUIPMENT_ADDED = "EQUIPMENT_ADDED", "Equipment Added"
        INFRASTRUCTURE = "INFRASTRUCTURE", "Infrastructure Update"
        RECORD = "RECORD", "General Record"

    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name="history")
    event_type = models.CharField(max_length=25, choices=EventType.choices, default=EventType.RECORD)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    event_date = models.DateField()
    related_model = models.CharField(max_length=100, blank=True, help_text="e.g. Field, Crop, Asset")
    related_object_id = models.CharField(max_length=64, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="farm_history_records",
    )

    class Meta:
        ordering = ["-event_date"]
        verbose_name_plural = "Farm histories"

    def __str__(self):
        return f"{self.farm.name} - {self.title} ({self.event_date})"
