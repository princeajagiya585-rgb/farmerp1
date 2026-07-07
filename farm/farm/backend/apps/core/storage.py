"""
Custom Django storage backend for Supabase Storage.

Uses the `supabase-py` client to upload, serve, and delete files through
Supabase's built-in Storage API (not the S3-compatible gateway, which has
compatibility issues with boto3's SigV4 signer for JWT credentials).

All uploaded files are stored in a single public bucket and served via the
Supabase CDN URL.  The Django storage interface (``Storage``) is implemented
so existing ``ImageField`` and ``FileField`` models work without changes.

Usage in settings.py::

    STORAGES = {
        "default": {"BACKEND": "apps.core.storage.SupabaseFileStorage"},
        "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
    }

Environment variables required in production (set in Railway dashboard)::

    SUPABASE_URL        — https://<project>.supabase.co
    SUPABASE_SERVICE_KEY — service_role JWT (NOT the anon key)
    SUPABASE_STORAGE_BUCKET — bucket name, defaults to "uploads"
"""

import io
import logging
import os
import uuid
from datetime import datetime, timezone

from django.conf import settings
from django.core.files.storage import Storage
from django.core.files.base import File as DjangoFile
from django.utils.deconstruct import deconstructible
from supabase import create_client

logger = logging.getLogger(__name__)


def get_supabase_client():
    """Return a singleton Supabase client using the service-role key.

    The client is cached on first call so only one connection pool is
    created per process (important for Gunicorn workers).
    """
    if not hasattr(get_supabase_client, "_client"):
        url = settings.SUPABASE_URL
        key = settings.SUPABASE_SERVICE_KEY
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in "
                "environment / Django settings."
            )
        get_supabase_client._client = create_client(url, key)
    return get_supabase_client._client


def get_bucket_name():
    """Return the configured storage bucket name."""
    return getattr(settings, "SUPABASE_STORAGE_BUCKET", "uploads")


def ensure_bucket_exists():
    """Create the ``uploads`` bucket if it does not already exist.

    Called once during application startup (see ``ready()`` in ``apps/core/apps.py``
    or from a management command).  The bucket is created as **public** so that
    every uploaded file is immediately accessible via its public URL without
    needing per-request Row-Level-Security policies.
    """
    client = get_supabase_client()
    bucket_id = get_bucket_name()

    try:
        existing = client.storage.get_bucket(bucket_id)
        logger.info("[Supabase] Bucket '%s' already exists.", bucket_id)
        return existing
    except Exception:
        logger.info("[Supabase] Creating bucket '%s' (public)...", bucket_id)

    try:
        bucket = client.storage.create_bucket(
            bucket_id,
            options={"public": True},
        )
        logger.info("[Supabase] Bucket '%s' created successfully.", bucket_id)
        return bucket
    except Exception as exc:
        logger.warning(
            "[Supabase] Could not create bucket '%s': %s",
            bucket_id,
            exc,
        )
        return None


def generate_storage_path(prefix: str, original_filename: str) -> str:
    """Generate a unique, timestamped path inside a prefix folder.

    Example::

        generate_storage_path("avatars", "photo.jpg")
        # → "avatars/2025/04/07/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg"
    """
    now = datetime.now(timezone.utc)
    ext = ""
    if "." in original_filename:
        ext = original_filename.rsplit(".", 1)[1].lower()
        # Only keep safe extensions
        if ext not in {"jpg", "jpeg", "png", "gif", "webp", "pdf", "doc", "docx",
                        "xls", "xlsx", "csv", "txt", "zip", "mp4", "mov", "avi",
                        "mp3", "wav", "ogg", "svg", "ico", "heic", "heif"}:
            ext = "bin"
    else:
        ext = "bin"

    unique_id = str(uuid.uuid4())
    return f"{prefix}/{now.year}/{now.month:02d}/{now.day:02d}/{unique_id}.{ext}"


# ─── Django Storage Backend ──────────────────────────────────────────────

@deconstructible
class SupabaseFileStorage(Storage):
    """Django storage backend that stores files in Supabase Storage.

    ``location`` and ``base_url`` are accepted for compatibility with code
    that passes them during ``Storage.__init__`` (e.g. some django-storages
    usage patterns), but they are **ignored** — paths and URLs are determined
    by the Supabase bucket configuration.
    """

    def __init__(self, location=None, base_url=None):
        self._client = None

    @property
    def client(self):
        if self._client is None:
            self._client = get_supabase_client()
        return self._client

    def _bucket(self):
        return self.client.storage.from_(get_bucket_name())

    @staticmethod
    def _normalize(name):
        """Supabase Storage keys must use forward slashes. On Windows Django
        builds ``upload_to`` paths with backslashes (e.g. ``location_pings\\x.png``),
        which Supabase rejects with ``InvalidKey``. Normalize to POSIX slashes so
        uploads/serving/deletes work identically on every host OS."""
        return (name or "").replace("\\", "/").lstrip("/")

    def _save(self, name, content):
        """Upload ``content`` to Supabase Storage at path ``name``.

        Returns the name (path) stored in Supabase.
        """
        if content is None:
            raise ValueError("Cannot save None content to Supabase Storage.")

        name = self._normalize(name)

        # Read file content — always seek(0) first to handle partially-
        # read file-like objects (e.g. after a validation pass).
        try:
            content.seek(0)
        except (AttributeError, io.UnsupportedOperation):
            pass

        file_name = getattr(content, "name", "") or name

        if isinstance(content, bytes):
            file_bytes = content
        elif isinstance(content, str):
            file_bytes = content.encode("utf-8")
        else:
            # Django UploadedFile / InMemoryUploadedFile / file-like
            try:
                file_bytes = content.read()
            except Exception:
                file_bytes = content.getvalue() if hasattr(content, "getvalue") else content

            if not isinstance(file_bytes, bytes):
                file_bytes = str(file_bytes).encode("utf-8")

        # Detect content type
        content_type = self._guess_content_type(file_name, name)

        # Upload to Supabase
        try:
            self._bucket().upload(
                path=name,
                file=file_bytes,
                file_options={"content-type": content_type},
            )
            logger.debug(
                "[Supabase] Uploaded '%s' (size=%d, type=%s)",
                name,
                len(file_bytes),
                content_type,
            )
        except Exception as exc:
            logger.error("[Supabase] Upload failed for '%s': %s", name, exc)
            raise

        return name

    def url(self, name):
        """Return the public Supabase CDN URL for the file at path ``name``."""
        if not name:
            return ""
        name = self._normalize(name)
        try:
            return self._bucket().get_public_url(name)
        except Exception as exc:
            logger.warning("[Supabase] Failed to get public URL for '%s': %s", name, exc)
            # Fallback: construct URL manually
            base = getattr(settings, "SUPABASE_URL", "").rstrip("/")
            bucket = get_bucket_name()
            return f"{base}/storage/v1/object/public/{bucket}/{name.lstrip('/')}"

    def delete(self, name):
        """Remove the file at path ``name`` from Supabase Storage."""
        if not name:
            return
        name = self._normalize(name)
        try:
            self._bucket().remove([name])
            logger.debug("[Supabase] Deleted '%s'", name)
        except Exception as exc:
            logger.warning("[Supabase] Delete failed for '%s': %s", name, exc)

    def exists(self, name):
        """Check whether a file exists at path ``name``.

        Uses a list call scoped to the file's parent directory since
        Supabase's Storage API does not expose a HEAD / metadata endpoint
        for individual files.
        """
        if not name:
            return False
        name = self._normalize(name)
        try:
            parent = os.path.dirname(name)
            files = self._bucket().list(path=parent)
            for f in files:
                if f.get("name") == os.path.basename(name):
                    return True
            return False
        except Exception:
            return False

    def size(self, name):
        """Return file size in bytes.

        .. caution::
            Supabase Storage does not expose a HEAD / metadata endpoint for
            individual files, so we cannot determine the exact size.  Return
            ``None`` so callers (validation, admin) treat it as unknown
            rather than incorrectly reporting 0 bytes (which can trigger
            spurious "empty file" errors).
        """
        return None

    def listdir(self, path):
        """List directory contents — directories, then files."""
        try:
            entries = self._bucket().list(path=path)
            dirs, files = [], []
            for e in entries:
                if e.get("id") is None:  # Supabase folders have no id
                    dirs.append(e["name"])
                else:
                    files.append(e["name"])
            return dirs, files
        except Exception:
            return [], []

    def get_available_name(self, name, max_length=None):
        """POSIX-normalize and guarantee a unique key.

        Supabase's ``upload`` (without upsert) rejects an existing key with a
        409, so two uploads named ``image.jpg`` (common from phone cameras)
        would collide and fail. Append a short UUID before the extension so
        every stored file gets a unique key."""
        name = self._normalize(name)
        root, ext = os.path.splitext(name)
        return f"{root}_{uuid.uuid4().hex[:12]}{ext}"

    def _guess_content_type(self, filename, fallback_name=""):
        """Guess MIME type from file extension."""
        ext = (filename or fallback_name or "").rsplit(".", 1)[-1].lower()
        MIME_MAP = {
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "png": "image/png",
            "gif": "image/gif",
            "webp": "image/webp",
            "svg": "image/svg+xml",
            "ico": "image/x-icon",
            "heic": "image/heic",
            "heif": "image/heif",
            "pdf": "application/pdf",
            "doc": "application/msword",
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "xls": "application/vnd.ms-excel",
            "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "csv": "text/csv",
            "txt": "text/plain",
            "zip": "application/zip",
            "mp4": "video/mp4",
            "mov": "video/quicktime",
            "avi": "video/x-msvideo",
            "mp3": "audio/mpeg",
            "wav": "audio/wav",
            "ogg": "audio/ogg",
        }
        return MIME_MAP.get(ext, "application/octet-stream")


# ─── Convenience helper for use in views (non-storage uploads) ────────────

def upload_to_supabase(file_obj, prefix: str = "uploads") -> str:
    """Upload a Django ``UploadedFile`` or ``InMemoryUploadedFile`` to Supabase
    Storage and return the **storage path** (not the full URL).

    Caller is responsible for persisting the returned path in the database.

    Example::

        path = upload_to_supabase(request.FILES[\"photo\"], \"avatars\")
        instance.photo = path   # ← stored in DB, URL resolved by storage.url()
        instance.save()
    """
    original_name = getattr(file_obj, "name", "file.bin")
    storage_path = generate_storage_path(prefix, original_name)

    storage = SupabaseFileStorage()
    storage._save(storage_path, file_obj)

    return storage_path


def get_supabase_public_url(storage_path: str) -> str:
    """Return the public Supabase CDN URL for a stored file path.

    If ``storage_path`` is already an absolute URL or is empty/None, returns
    it as-is.
    """
    if not storage_path:
        return ""
    if storage_path.startswith(("http://", "https://")):
        return storage_path
    storage = SupabaseFileStorage()
    return storage.url(storage_path)
