from django.contrib import admin

from .models import FieldActivity, Geofence, LocationPing


@admin.register(Geofence)
class GeofenceAdmin(admin.ModelAdmin):
    list_display = ("name", "farm", "radius_m", "center_lat", "center_lng")
    list_filter = ("farm",)
    search_fields = ("name",)


@admin.register(LocationPing)
class LocationPingAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "farm",
        "activity",
        "latitude",
        "longitude",
        "recorded_at",
    )
    list_filter = ("activity", "farm")
    search_fields = ("user__username",)


@admin.register(FieldActivity)
class FieldActivityAdmin(admin.ModelAdmin):
    list_display = ("user", "farm", "task", "status", "recorded_at")
    list_filter = ("status", "farm")
    search_fields = ("description", "user__username")
