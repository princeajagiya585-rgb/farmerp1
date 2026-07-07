import logging

from django.apps import AppConfig

logger = logging.getLogger(__name__)


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.core"

    def ready(self):
        """
        Application startup initialiser.

        When Supabase Storage credentials are configured, ensure the
        storage bucket exists so the first upload does not fail with a
        "bucket not found" error.
        """
        from django.conf import settings

        supabase_url = getattr(settings, "SUPABASE_URL", "")
        supabase_key = getattr(settings, "SUPABASE_SERVICE_KEY", "")

        if supabase_url and supabase_key:
            try:
                from apps.core.storage import ensure_bucket_exists
                ensure_bucket_exists()
            except Exception:
                logger.warning(
                    "[Supabase] Bucket setup skipped — can continue at runtime."
                )
