from django.contrib import admin

from .models import Item, StockMovement


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    list_display = ("name", "sku", "category", "farm", "current_stock", "reorder_level", "unit_cost")
    list_filter = ("category", "farm")
    search_fields = ("name", "sku", "supplier")


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ("item", "farm", "movement_type", "quantity", "date", "reference")
    list_filter = ("movement_type", "farm")
    search_fields = ("item__name", "reference", "reason")
