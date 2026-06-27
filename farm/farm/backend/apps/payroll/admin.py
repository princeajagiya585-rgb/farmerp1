from django.contrib import admin

from .models import (
    PayrollPeriod,
    Advance,
    Incentive,
    Deduction,
    Payslip,
    Payment,
)


@admin.register(PayrollPeriod)
class PayrollPeriodAdmin(admin.ModelAdmin):
    list_display = ("farm", "month", "year", "status", "generated_at")
    list_filter = ("status", "farm", "year", "month")
    search_fields = ("farm__name",)


@admin.register(Advance)
class AdvanceAdmin(admin.ModelAdmin):
    list_display = ("employee", "farm", "amount", "amount_repaid", "status", "date")
    list_filter = ("status", "farm")
    search_fields = ("employee__first_name", "employee__last_name", "reason")


@admin.register(Incentive)
class IncentiveAdmin(admin.ModelAdmin):
    list_display = ("employee", "farm", "amount", "date")
    list_filter = ("farm",)
    search_fields = ("employee__first_name", "employee__last_name", "reason")


@admin.register(Deduction)
class DeductionAdmin(admin.ModelAdmin):
    list_display = ("employee", "farm", "deduction_type", "amount", "date")
    list_filter = ("deduction_type", "farm")
    search_fields = ("employee__first_name", "employee__last_name", "notes")


@admin.register(Payslip)
class PayslipAdmin(admin.ModelAdmin):
    list_display = (
        "employee",
        "period",
        "farm",
        "days_worked",
        "gross_wage",
        "net_pay",
        "status",
    )
    list_filter = ("status", "farm")
    search_fields = ("employee__first_name", "employee__last_name")


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("employee", "payslip", "amount", "mode", "date", "reference")
    list_filter = ("mode",)
    search_fields = ("employee__first_name", "employee__last_name", "reference")
