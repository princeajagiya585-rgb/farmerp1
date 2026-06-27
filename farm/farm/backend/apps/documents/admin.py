from django.contrib import admin

from .models import Document, DocumentVersion


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("title", "category", "farm", "version", "expiry_date", "created_by")
    list_filter = ("category", "farm")
    search_fields = ("title", "description", "tags")


@admin.register(DocumentVersion)
class DocumentVersionAdmin(admin.ModelAdmin):
    list_display = ("document", "version", "created_at")
    list_filter = ("document",)
    search_fields = ("document__title", "notes")
