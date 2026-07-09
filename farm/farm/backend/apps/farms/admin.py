from django.contrib import admin

from .models import Farm, Field, FarmDocument, FarmHistory


@admin.register(Farm)
class FarmAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "location", "latitude", "longitude", "check_in_radius", "total_area", "manager", "field_count")
    search_fields = ("name", "code", "location")
    list_filter = ("is_active", "soil_type", "irrigation_type")
    fieldsets = (
        (None, {
            "fields": ("name", "code", "location", "manager", "notes")
        }),
        ("Geofence / GPS Settings", {
            "fields": ("latitude", "longitude", "check_in_radius", "geofence"),
            "description": "Set farm center coordinates and check-in radius (in meters). Employees must be within this radius for geofence approval.",
            "classes": ("wide", "collapse"),
        }),
        ("Area & Climate", {
            "fields": ("total_area", "soil_type", "climate_zone", "irrigation_type", "established_date"),
        }),
    )


@admin.register(Field)
class FieldAdmin(admin.ModelAdmin):
    list_display = ("name", "farm", "area", "soil_type", "is_active")
    list_filter = ("farm", "soil_type", "is_active")
    search_fields = ("name", "code")


@admin.register(FarmDocument)
class FarmDocumentAdmin(admin.ModelAdmin):
    list_display = ("title", "farm", "doc_type", "issue_date", "expiry_date")
    list_filter = ("farm", "doc_type")
    search_fields = ("title", "description")


@admin.register(FarmHistory)
class FarmHistoryAdmin(admin.ModelAdmin):
    list_display = ("title", "farm", "event_type", "event_date", "recorded_by")
    list_filter = ("farm", "event_type")
    search_fields = ("title", "description")
