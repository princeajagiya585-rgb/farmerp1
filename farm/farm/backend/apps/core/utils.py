"""
Shared utility for building absolute photo URLs from uploaded image fields.

Centralized here to avoid duplicating the same logic across accounts,
workforce, and gps serializer files. Always import from this module.
"""
from django.conf import settings


def build_absolute_photo_url(photo, request=None):
    """
    Convert a photo/ImageField value to an absolute URL.

    When using S3 storage, ``photo.url`` already returns a fully qualified
    URL (e.g. ``https://bucket.s3.amazonaws.com/media/photo.jpg``), so we
    must NOT wrap it with ``request.build_absolute_uri`` again — that would
    produce double-scheme URLs like ``https://host/https://bucket/...``.

    Resolution order:
    1. ``None`` / empty   → return ``None``
    2. Already absolute   → return as-is (S3)
    3. Has ``request``    → ``request.build_absolute_uri(url)``
    4. Fallback           → ``settings.BACKEND_URL + url``
    """
    if not photo:
        return None
    try:
        url = photo.url
    except Exception:
        return None

    if not url:
        return None

    # Already an absolute URL (S3, CDN, etc.) — return as-is.
    if url.startswith(("http://", "https://")):
        return url

    # Relative path: prepend the request origin or the configured backend URL.
    if request:
        return request.build_absolute_uri(url)
    return f"{settings.BACKEND_URL.rstrip('/')}{url}"
