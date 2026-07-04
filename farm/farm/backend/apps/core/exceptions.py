"""Custom DRF exception handler that returns consistent JSON error responses.

Catches all unhandled exceptions (including 500 Internal Server Errors)
and returns a proper JSON response instead of an HTML error page, so the
frontend always receives a parseable error object.
"""
import logging
import traceback

from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


def exception_handler(exc, context):
    """DRF exception handler that ensures all errors return JSON.

    - Catches Django ValidationError, Http404, PermissionDenied
    - Catches all unhandled Exception → 500 Internal Server Error
    - Logs exceptions with traceback for debugging
    - Ensures consistent JSON structure: {"detail": "message"}
    """
    # Let DRF handle its own exceptions first (Throttled, ParseError, etc.)
    response = drf_exception_handler(exc, context)

    if response is not None:
        return response

    # ── Django exceptions → DRF equivalents ──────────────────────────────
    if isinstance(exc, Http404):
        return Response(
            {"detail": "Not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if isinstance(exc, PermissionDenied):
        return Response(
            {"detail": "Permission denied."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if isinstance(exc, DjangoValidationError):
        return Response(
            {"detail": exc.messages if hasattr(exc, "messages") else str(exc)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # ── Unhandled exceptions → 500 JSON ──────────────────────────────────
    logger.error(
        "Unhandled exception in %s.%s: %s\n%s",
        context["view"].__class__.__name__ if "view" in context else "?",
        context["view"].action if "view" in context and hasattr(context["view"], "action") else "?",
        exc,
        traceback.format_exc(),
    )

    detail = "Internal server error."
    if settings.DEBUG:
        detail = f"{type(exc).__name__}: {exc}"

    return Response(
        {"detail": detail, "error_type": type(exc).__name__},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
