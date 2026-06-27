from django.db import models

from apps.core.models import OwnedModel


class Crop(OwnedModel):
    class Status(models.TextChoices):
        PLANNED = "PLANNED", "Planned"
        PLANTED = "PLANTED", "Planted"
        GROWING = "GROWING", "Growing"
        HARVESTED = "HARVESTED", "Harvested"
        FAILED = "FAILED", "Failed"

    name = models.CharField(max_length=255)
    variety = models.CharField(max_length=255, blank=True)
    farm = models.ForeignKey(
        "farms.Farm", on_delete=models.CASCADE, related_name="crops"
    )
    field = models.ForeignKey(
        "farms.Field",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crops",
    )
    season = models.CharField(max_length=255, blank=True)
    planting_date = models.DateField(null=True, blank=True)
    expected_harvest_date = models.DateField(null=True, blank=True)
    area = models.DecimalField(
        max_digits=12, decimal_places=2, default=0, help_text="acres"
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PLANNED
    )
    growth_stage = models.CharField(max_length=255, blank=True)
    expected_yield = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True)

    def __str__(self):
        return f"{self.name} {self.variety}"


class PlantationRecord(OwnedModel):
    crop = models.ForeignKey(
        Crop, on_delete=models.CASCADE, related_name="plantation_records"
    )
    farm = models.ForeignKey("farms.Farm", on_delete=models.CASCADE)
    date = models.DateField()
    spacing = models.CharField(max_length=255, blank=True)
    plant_count = models.IntegerField(default=0)
    notes = models.TextField(blank=True)

    def __str__(self):
        return f"Plantation {self.crop} @ {self.date}"


class Observation(OwnedModel):
    class ObservationType(models.TextChoices):
        PEST = "PEST", "Pest"
        DISEASE = "DISEASE", "Disease"
        NUTRIENT = "NUTRIENT", "Nutrient"
        WEATHER = "WEATHER", "Weather"
        GROWTH = "GROWTH", "Growth"

    class Severity(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"

    crop = models.ForeignKey(
        Crop, on_delete=models.CASCADE, related_name="observations"
    )
    farm = models.ForeignKey("farms.Farm", on_delete=models.CASCADE)
    field = models.ForeignKey(
        "farms.Field", on_delete=models.SET_NULL, null=True, blank=True
    )
    observation_type = models.CharField(
        max_length=20,
        choices=ObservationType.choices,
        default=ObservationType.GROWTH,
    )
    severity = models.CharField(
        max_length=20, choices=Severity.choices, default=Severity.LOW
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    photo = models.ImageField(upload_to="agronomy/", null=True, blank=True)
    latitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    longitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    observed_on = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"{self.title} ({self.observation_type})"


class InputApplication(OwnedModel):
    class InputType(models.TextChoices):
        FERTILIZER = "FERTILIZER", "Fertilizer"
        PESTICIDE = "PESTICIDE", "Pesticide"
        HERBICIDE = "HERBICIDE", "Herbicide"
        BIOLOGICAL = "BIOLOGICAL", "Biological"
        IRRIGATION = "IRRIGATION", "Irrigation"

    crop = models.ForeignKey(
        Crop, on_delete=models.CASCADE, related_name="input_applications"
    )
    farm = models.ForeignKey("farms.Farm", on_delete=models.CASCADE)
    field = models.ForeignKey(
        "farms.Field", on_delete=models.SET_NULL, null=True, blank=True
    )
    input_type = models.CharField(
        max_length=20, choices=InputType.choices, default=InputType.FERTILIZER
    )
    product_name = models.CharField(max_length=255)
    inventory_item = models.ForeignKey(
        "inventory.Item",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="applications",
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit = models.CharField(max_length=255, blank=True, default="kg")
    dosage = models.CharField(max_length=255, blank=True)
    cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    applied_on = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    def __str__(self):
        return f"{self.product_name} on {self.crop}"


class GrowthRecord(OwnedModel):
    crop = models.ForeignKey(
        Crop, on_delete=models.CASCADE, related_name="growth_records"
    )
    farm = models.ForeignKey("farms.Farm", on_delete=models.CASCADE)
    date = models.DateField()
    stage = models.CharField(max_length=255, blank=True)
    height_cm = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    health_index = models.IntegerField(default=0, help_text="0-100")
    notes = models.TextField(blank=True)

    def __str__(self):
        return f"Growth {self.crop} @ {self.date}"


class HarvestRecord(OwnedModel):
    crop = models.ForeignKey(
        Crop, on_delete=models.CASCADE, related_name="harvest_records"
    )
    farm = models.ForeignKey("farms.Farm", on_delete=models.CASCADE)
    date = models.DateField()
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit = models.CharField(max_length=255, blank=True, default="kg")
    quality_grade = models.CharField(max_length=255, blank=True)
    yield_per_acre = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    revenue = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True)

    def __str__(self):
        return f"Harvest {self.crop} @ {self.date}"
