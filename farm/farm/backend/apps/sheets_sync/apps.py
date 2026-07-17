import logging

from django.apps import AppConfig

logger = logging.getLogger(__name__)


class SheetsSyncConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.sheets_sync"
    verbose_name = "Google Sheets Sync"

    def ready(self):
        """
        Register the post-commit signal handlers that mirror every Supabase
        write into the Google Spreadsheet.

        Supabase stays the primary database: handlers fire only via
        ``transaction.on_commit``, i.e. after the row is durably committed.
        A sync failure is logged and retried but can never roll back or
        block the database write.
        """
        from apps.sheets_sync import conf

        if not conf.sync_enabled():
            logger.info(
                "[SheetsSync] Disabled — set GOOGLE_SERVICE_ACCOUNT_JSON (or "
                "GOOGLE_SERVICE_ACCOUNT_FILE) and GOOGLE_SHEETS_SYNC_ENABLED=1 "
                "to activate."
            )
            return

        from apps.sheets_sync import signals

        signals.connect_all()
        logger.info("[SheetsSync] Live sync enabled for %s models.",
                    signals.connected_model_count())
