"""
Django Admin integration: read-only sync logs plus a sync dashboard.

The dashboard (Admin → Sheets Sync → Sync log entries → Dashboard) shows
connection health, queue depth, success/failure counters and the latest
log entries, and offers two superuser-only actions:

* **Sync Now** — re-enqueues every recently FAILED record for another
  attempt through the normal worker (with backoff).
* **Rebuild all sheets** — runs ``sheets_backfill`` in a background
  thread, rewriting every worksheet from database truth.
"""
import io
import logging
import threading
from datetime import timedelta

from django.contrib import admin, messages
from django.core.cache import cache
from django.core.exceptions import PermissionDenied
from django.core.management import call_command
from django.shortcuts import redirect
from django.template.response import TemplateResponse
from django.urls import path
from django.utils import timezone

from apps.sheets_sync import client, conf, registry, worker
from apps.sheets_sync.models import SyncLog

logger = logging.getLogger(__name__)

STATUS_CACHE_KEY = "sheets_sync:connection_status"
STATUS_CACHE_TTL = 60  # seconds

_rebuild_lock = threading.Lock()
_rebuild_running = False


def _connection_status():
    """Cheap cached connection probe for the dashboard."""
    status = cache.get(STATUS_CACHE_KEY)
    if status is not None:
        return status

    if not conf.fully_configured():
        status = {"ok": False,
                  "detail": "Not configured — missing credentials or "
                            "GOOGLE_SPREADSHEET_ID."}
    else:
        try:
            sh = client.get_spreadsheet()
            status = {
                "ok": True,
                "detail": f"Connected to '{sh.title}'",
                "url": f"https://docs.google.com/spreadsheets/d/{sh.id}",
            }
        except Exception as exc:
            status = {"ok": False, "detail": f"{type(exc).__name__}: {exc}"}
    cache.set(STATUS_CACHE_KEY, status, STATUS_CACHE_TTL)
    return status


def _run_rebuild():
    """Background thread body for the Rebuild button."""
    global _rebuild_running
    out = io.StringIO()
    try:
        call_command("sheets_backfill", stdout=out)
        logger.info("[SheetsSync] Admin rebuild finished:\n%s",
                    out.getvalue())
    except Exception:
        logger.exception("[SheetsSync] Admin rebuild failed")
    finally:
        with _rebuild_lock:
            _rebuild_running = False


@admin.register(SyncLog)
class SyncLogAdmin(admin.ModelAdmin):
    list_display = ("timestamp", "operation", "table_name", "record_id",
                    "status", "attempts", "short_error")
    list_filter = ("status", "operation", "table_name")
    search_fields = ("table_name", "record_id", "error")
    date_hierarchy = "timestamp"
    ordering = ("-timestamp",)
    list_per_page = 50
    change_list_template = "admin/sheets_sync/synclog/change_list.html"

    @admin.display(description="error")
    def short_error(self, obj):
        return (obj.error[:80] + "…") if len(obj.error) > 80 else obj.error

    # The log is an audit trail — nobody edits or fabricates entries.
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser

    # -- dashboard ---------------------------------------------------------

    def get_urls(self):
        urls = [
            path("dashboard/",
                 self.admin_site.admin_view(self.dashboard_view),
                 name="sheets_sync_dashboard"),
            path("dashboard/sync-now/",
                 self.admin_site.admin_view(self.sync_now_view),
                 name="sheets_sync_sync_now"),
            path("dashboard/rebuild/",
                 self.admin_site.admin_view(self.rebuild_view),
                 name="sheets_sync_rebuild"),
        ]
        return urls + super().get_urls()

    @staticmethod
    def _require_superuser(request):
        if not request.user.is_superuser:
            raise PermissionDenied

    def dashboard_view(self, request):
        self._require_superuser(request)
        last_success = (SyncLog.objects
                        .filter(status=SyncLog.STATUS_SUCCESS)
                        .order_by("-timestamp").first())
        context = {
            **self.admin_site.each_context(request),
            "title": "Google Sheets Sync Dashboard",
            "connection": _connection_status(),
            "sync_enabled": conf.sync_enabled(),
            "worker_alive": worker.worker_alive(),
            "pending": worker.pending_count(),
            "last_success": last_success.timestamp if last_success else None,
            "total_synced": SyncLog.objects.filter(
                status=SyncLog.STATUS_SUCCESS).count(),
            "failed_total": SyncLog.objects.filter(
                status=SyncLog.STATUS_FAILED).count(),
            "failed_24h": SyncLog.objects.filter(
                status=SyncLog.STATUS_FAILED,
                timestamp__gte=timezone.now() - timedelta(hours=24)).count(),
            "recent_logs": SyncLog.objects.all()[:25],
            "rebuild_running": _rebuild_running,
        }
        return TemplateResponse(
            request, "admin/sheets_sync/dashboard.html", context)

    def sync_now_view(self, request):
        """Re-enqueue every record that FAILED in the last 7 days."""
        self._require_superuser(request)
        if request.method != "POST":
            return redirect("admin:sheets_sync_dashboard")

        since = timezone.now() - timedelta(days=7)
        failed = (SyncLog.objects
                  .filter(status=SyncLog.STATUS_FAILED, timestamp__gte=since)
                  .values_list("table_name", "record_id", "operation")
                  .distinct())
        queued = skipped = 0
        for table, record_id, operation in failed:
            model = registry.model_for_table(table)
            if operation == SyncLog.OP_DELETE:
                worker.enqueue_delete(table, record_id)
                queued += 1
            elif model is None:
                skipped += 1  # table no longer exists in the schema
            elif record_id:
                worker.enqueue_upsert(model._meta.app_label,
                                      model._meta.model_name, record_id)
                queued += 1
            else:
                worker.enqueue_refresh(model._meta.app_label,
                                       model._meta.model_name)
                queued += 1

        if queued:
            messages.success(
                request, f"Re-queued {queued} failed sync operation(s); "
                         "the worker is retrying them now.")
        else:
            messages.info(request, "No failed operations from the last "
                                   "7 days to retry.")
        if skipped:
            messages.warning(
                request, f"Skipped {skipped} entrie(s) for tables that no "
                         "longer exist.")
        return redirect("admin:sheets_sync_dashboard")

    def rebuild_view(self, request):
        """Rewrite every worksheet from database truth (background)."""
        global _rebuild_running
        self._require_superuser(request)
        if request.method != "POST":
            return redirect("admin:sheets_sync_dashboard")

        with _rebuild_lock:
            if _rebuild_running:
                messages.warning(request, "A rebuild is already running.")
                return redirect("admin:sheets_sync_dashboard")
            _rebuild_running = True

        threading.Thread(target=_run_rebuild, name="sheets-sync-rebuild",
                         daemon=True).start()
        messages.success(
            request, "Rebuild started in the background — every worksheet "
                     "will be rewritten from the database. Progress is "
                     "logged under [SheetsSync].")
        return redirect("admin:sheets_sync_dashboard")
