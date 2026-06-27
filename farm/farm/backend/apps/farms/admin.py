from django.contrib import admin

from .models import Farm, Field, FarmDocument, FarmHistory


@admin.register(Farm)
class FarmAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "location", "total_area", "manager", "field_count")
    search_fields = ("name", "code", "location")
    list_filter = ("is_active", "soil_type", "irrigation_type")


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
