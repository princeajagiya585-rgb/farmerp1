"""
Configuration helpers for the Google Sheets mirror.

All knobs come from environment variables (surfaced via Django settings):

GOOGLE_SHEETS_SYNC_ENABLED   — master switch (default: on when creds exist)
GOOGLE_SERVICE_ACCOUNT_JSON  — raw service-account JSON (recommended on Railway)
GOOGLE_SERVICE_ACCOUNT_FILE  — path to a service-account JSON file (local dev;
                               auto-discovered from backend/credentials/)
GOOGLE_SPREADSHEET_ID        — ID of the EXISTING target spreadsheet (required;
                               the sync never creates a spreadsheet)
"""
from django.conf import settings


def _get(name, default=""):
    return getattr(settings, name, default)


def credentials_configured():
    return bool(_get("GOOGLE_SERVICE_ACCOUNT_JSON") or _get("GOOGLE_SERVICE_ACCOUNT_FILE"))


def spreadsheet_id():
    return _get("GOOGLE_SPREADSHEET_ID")


def fully_configured():
    return credentials_configured() and bool(spreadsheet_id())


def sync_enabled():
    return bool(_get("GOOGLE_SHEETS_SYNC_ENABLED", True)) and fully_configured()
