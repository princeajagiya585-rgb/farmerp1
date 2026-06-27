from django.contrib import admin
from django.contrib import messages
from django.http import HttpResponseRedirect
from django.urls import path, reverse
from django.utils import timezone
from django.utils.html import format_html

from .models import BreakdownReport


@admin.register(BreakdownReport)
class BreakdownReportAdmin(admin.ModelAdmin):
    list_display = (
        "machine_name",
        "farm",
        "severity_badge",
        "status_badge",
        "created_by",
        "acknowledged_by",
        "created_at",
        "photo_preview",
        "action_buttons",
    )
    list_filter = ("severity", "status", "farm", "created_at")
    search_fields = ("machine_name", "details", "resolution_notes")
    date_hierarchy = "created_at"
    readonly_fields = (
        "created_at", "updated_at", "resolved_at",
        "created_by", "acknowledged_by",
    )

    fieldsets = (
        ("Machine & Farm", {
            "fields": ("machine_name", "farm", "severity", "status"),
        }),
        ("Report Details", {
            "fields": ("details", "photo"),
        }),
        ("Reported By & Time", {
            "fields": ("created_by", "created_at"),
            "description": "Automatically recorded when report is created.",
        }),
        ("Resolution Info", {
            "fields": ("acknowledged_by", "resolution_notes", "resolved_at"),
            "classes": ("collapse",),
        }),
        ("GPS Coordinates", {
            "fields": (("latitude", "longitude"),),
            "classes": ("collapse",),
        }),
    )

    actions = ["acknowledge_reports", "mark_in_progress", "resolve_reports"]

    # ------------------------------------------------------------------
    # Badge display methods
    # ------------------------------------------------------------------

    def severity_badge(self, obj):
        colors = {
            "LOW": "#6b7280",
            "MEDIUM": "#2563eb",
            "HIGH": "#d97706",
            "CRITICAL": "#dc2626",
        }
        return format_html(
            '<span style="background:{};color:#fff;padding:2px 10px;border-radius:10px;'
            'font-weight:600;font-size:0.75rem">{}</span>',
            colors.get(obj.severity, "#6b7280"),
            obj.get_severity_display(),
        )
    severity_badge.short_description = "Severity"
    severity_badge.admin_order_field = "severity"

    def status_badge(self, obj):
        colors = {
            "REPORTED": "#d97706",
            "ACKNOWLEDGED": "#2563eb",
            "IN_PROGRESS": "#7c3aed",
            "RESOLVED": "#16a34a",
        }
        icons = {
            "REPORTED": "🆕",
            "ACKNOWLEDGED": "👁️",
            "IN_PROGRESS": "🔧",
            "RESOLVED": "✅",
        }
        return format_html(
            '<span style="background:{};color:#fff;padding:2px 10px;border-radius:10px;'
            'font-weight:600;font-size:0.75rem">{} {}</span>',
            colors.get(obj.status, "#6b7280"),
            icons.get(obj.status, ""),
            obj.get_status_display(),
        )
    status_badge.short_description = "Status"
    status_badge.admin_order_field = "status"

    def photo_preview(self, obj):
        if obj.photo:
            return format_html(
                '<a href="{}" target="_blank">'
                '<img src="{}" style="height:36px;width:36px;object-fit:cover;'
                'border-radius:6px;border:1px solid #e5e7eb" /></a>',
                obj.photo.url, obj.photo.url,
            )
        return format_html('<span style="color:#9ca3af">—</span>')
    photo_preview.short_description = "Photo"

    # ------------------------------------------------------------------
    # Per-row inline action buttons
    # ------------------------------------------------------------------

    def action_buttons(self, obj):
        buttons = []

        if obj.status != "RESOLVED":
            if obj.status == "REPORTED":
                ack_url = reverse("admin:breakdowns-acknowledge", args=[obj.pk])
                buttons.append(
                    f'<a href="{ack_url}" style="background:#2563eb;color:#fff;'
                    f'padding:3px 10px;border-radius:6px;text-decoration:none;'
                    f'font-size:0.75rem;margin-right:4px;display:inline-block">'
                    f'Acknowledge</a>'
                )
            resolve_url = reverse("admin:breakdowns-resolve", args=[obj.pk])
            buttons.append(
                f'<a href="{resolve_url}" style="background:#16a34a;color:#fff;'
                f'padding:3px 10px;border-radius:6px;text-decoration:none;'
                f'font-size:0.75rem;display:inline-block">Resolve</a>'
            )

        if not buttons:
            return format_html('<span style="color:#16a34a;font-weight:600">✓ Done</span>')

        return format_html("&nbsp;".join(buttons))
    action_buttons.short_description = "Actions"

    # ------------------------------------------------------------------
    # Bulk actions
    # ------------------------------------------------------------------

    @admin.action(description="✅ Mark selected as Acknowledged")
    def acknowledge_reports(self, request, queryset):
        now = timezone.now()
        updated = queryset.exclude(status="RESOLVED").update(
            status=BreakdownReport.Status.ACKNOWLEDGED,
            acknowledged_by=request.user,
            updated_at=now,
        )
        self.message_user(request, f"{updated} report(s) marked as Acknowledged.")

    @admin.action(description="🔧 Mark selected as In Progress")
    def mark_in_progress(self, request, queryset):
        now = timezone.now()
        updated = queryset.exclude(status__in=["RESOLVED", "IN_PROGRESS"]).update(
            status=BreakdownReport.Status.IN_PROGRESS,
            updated_at=now,
        )
        self.message_user(request, f"{updated} report(s) marked as In Progress.")

    @admin.action(description="✅ Mark selected as Resolved")
    def resolve_reports(self, request, queryset):
        now = timezone.now()
        updated = queryset.exclude(status="RESOLVED").update(
            status=BreakdownReport.Status.RESOLVED,
            resolved_at=now,
            updated_at=now,
        )
        self.message_user(request, f"{updated} report(s) marked as Resolved.")

    # ------------------------------------------------------------------
    # Custom URLs for per-row action views
    # ------------------------------------------------------------------

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "<int:pk>/acknowledge/",
                self.admin_site.admin_view(self.acknowledge_view),
                name="breakdowns-acknowledge",
            ),
            path(
                "<int:pk>/resolve/",
                self.admin_site.admin_view(self.resolve_view),
                name="breakdowns-resolve",
            ),
        ]
        return custom_urls + urls

    def acknowledge_view(self, request, pk):
        report = self.get_object(request, pk)
        if report is None:
            self.message_user(request, "Report not found.", level=messages.ERROR)
        elif report.status != "RESOLVED":
            report.status = BreakdownReport.Status.ACKNOWLEDGED
            report.acknowledged_by = request.user
            report.save(update_fields=["status", "acknowledged_by", "updated_at"])
            self.message_user(request, f"'{report}' has been acknowledged.")
        else:
            self.message_user(request, f"'{report}' is already resolved.", level=messages.WARNING)
        return HttpResponseRedirect(
            reverse("admin:breakdowns_breakdownreport_changelist")
        )

    def resolve_view(self, request, pk):
        report = self.get_object(request, pk)
        if report is None:
            self.message_user(request, "Report not found.", level=messages.ERROR)
        elif report.status != "RESOLVED":
            report.status = BreakdownReport.Status.RESOLVED
            report.resolved_at = timezone.now()
            if not report.acknowledged_by:
                report.acknowledged_by = request.user
            report.save()
            self.message_user(request, f"'{report}' has been resolved.")
        else:
            self.message_user(request, f"'{report}' is already resolved.", level=messages.WARNING)
        return HttpResponseRedirect(
            reverse("admin:breakdowns_breakdownreport_changelist")
        )

    # ------------------------------------------------------------------
    # Optimised queryset
    # ------------------------------------------------------------------

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            "farm", "created_by", "acknowledged_by"
        )
