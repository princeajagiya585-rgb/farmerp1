from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.utils.html import format_html

from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ("username", "email", "role_badge", "is_active", "is_staff")
    list_filter = ("role", "is_active", "is_staff")
    fieldsets = UserAdmin.fieldsets + (
        ("Farm ERP", {"fields": ("role", "phone", "preferred_language", "avatar", "farms", "fcm_token")}),
    )
    filter_horizontal = UserAdmin.filter_horizontal + ("farms",)

    class Media:
        css = {
            "all": ("accounts/css/custom_user_admin.css",)
        }

    def role_badge(self, obj):
        if obj.role == "SUPER_ADMIN":
            return format_html(
                '<span style="background:#7c3aed;color:#fff;padding:3px 10px;'
                'border-radius:12px;font-weight:600;font-size:0.8rem;'
                'letter-spacing:0.3px">⭐ Super Admin</span>'
            )
        elif obj.role == "FARM_MANAGER":
            return format_html(
                '<span style="background:#2563eb;color:#fff;padding:3px 10px;'
                'border-radius:12px;font-weight:500;font-size:0.8rem">Manager</span>'
            )
        return format_html(
            '<span style="background:#6b7280;color:#fff;padding:3px 10px;'
            'border-radius:12px;font-weight:500;font-size:0.8rem">Employee</span>'
        )

    role_badge.short_description = "Role"
    role_badge.admin_order_field = "role"
