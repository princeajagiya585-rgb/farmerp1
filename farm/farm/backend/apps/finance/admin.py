from django.contrib import admin

from .models import (
    Expense,
    LedgerEntry,
    Payment,
    Purchase,
    PurchaseItem,
    RevenueEntry,
)


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = (
        "category",
        "farm",
        "amount",
        "date",
        "status",
        "is_paid",
    )
    list_filter = ("category", "status", "is_paid", "farm")
    search_fields = ("description",)


@admin.register(Purchase)
class PurchaseAdmin(admin.ModelAdmin):
    list_display = (
        "invoice_no",
        "farm",
        "total_amount",
        "date",
        "status",
        "is_paid",
    )
    list_filter = ("status", "is_paid", "farm")
    search_fields = ("invoice_no", "notes")


@admin.register(PurchaseItem)
class PurchaseItemAdmin(admin.ModelAdmin):
    list_display = ("name", "purchase", "quantity", "unit_price", "amount")
    search_fields = ("name", "purchase__invoice_no")


@admin.register(LedgerEntry)
class LedgerEntryAdmin(admin.ModelAdmin):
    list_display = (
        "entry_type",
        "farm",
        "account",
        "amount",
        "date",
        "reference",
    )
    list_filter = ("entry_type", "farm")
    search_fields = ("account", "reference", "description")


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("farm", "amount", "date", "mode", "reference")
    list_filter = ("mode", "farm")
    search_fields = ("reference",)


@admin.register(RevenueEntry)
class RevenueEntryAdmin(admin.ModelAdmin):
    list_display = ("source", "farm", "amount", "date")
    list_filter = ("source", "farm")
    search_fields = ("description",)
