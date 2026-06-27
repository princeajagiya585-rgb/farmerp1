from django.contrib import admin

from .models import (
    Crop,
    GrowthRecord,
    HarvestRecord,
    InputApplication,
    Observation,
    PlantationRecord,
)


@admin.register(Crop)
class CropAdmin(admin.ModelAdmin):
    list_display = ("name", "variety", "farm", "season", "status", "area")
    list_filter = ("status", "season", "farm")
    search_fields = ("name", "variety")


@admin.register(PlantationRecord)
class PlantationRecordAdmin(admin.ModelAdmin):
    list_display = ("crop", "farm", "date", "spacing", "plant_count")
    list_filter = ("farm",)
    search_fields = ("spacing", "notes")


@admin.register(Observation)
class ObservationAdmin(admin.ModelAdmin):
    list_display = ("title", "crop", "farm", "observation_type", "severity", "observed_on")
    list_filter = ("observation_type", "severity", "farm")
    search_fields = ("title", "description")


@admin.register(InputApplication)
class InputApplicationAdmin(admin.ModelAdmin):
    list_display = ("product_name", "crop", "farm", "input_type", "quantity", "cost", "applied_on")
    list_filter = ("input_type", "farm")
    search_fields = ("product_name", "dosage", "notes")


@admin.register(GrowthRecord)
class GrowthRecordAdmin(admin.ModelAdmin):
    list_display = ("crop", "farm", "date", "stage", "height_cm", "health_index")
    list_filter = ("farm",)
    search_fields = ("stage", "notes")


@admin.register(HarvestRecord)
class HarvestRecordAdmin(admin.ModelAdmin):
    list_display = ("crop", "farm", "date", "quantity", "quality_grade", "yield_per_acre", "revenue")
    list_filter = ("farm",)
    search_fields = ("quality_grade", "notes")
