from django.contrib import admin

from .models import Asset, AssetMaintenance


@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "asset_type",
        "farm",
        "status",
        "purchase_cost",
        "current_value",
        "assigned_to",
    )
    list_filter = ("asset_type", "status", "farm")
    search_fields = ("name", "code", "manufacturer", "model_number", "serial_number")


@admin.register(AssetMaintenance)
class AssetMaintenanceAdmin(admin.ModelAdmin):
    list_display = ("asset", "maintenance_type", "date", "cost", "next_due_date")
    list_filter = ("maintenance_type", "date")
    search_fields = ("description", "performed_by")
