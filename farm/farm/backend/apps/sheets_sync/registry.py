"""
Which Supabase tables get mirrored to Google Sheets, and how a model
instance becomes a spreadsheet row.

Only **Farm ERP business tables** are mirrored.  A model qualifies when
its app lives in this project's ``apps.*`` package (farms, workforce,
payroll, tasks, agronomy, inventory, finance, gps, notifications,
documents, breakdowns, assets, ...) — detected automatically, so future
business modules join the sync with zero configuration.  Everything
else never qualifies:

* Django/third-party system tables (``auth_*``, ``django_*``, sessions,
  admin log, content types, permissions, migrations, JWT blacklist)
  don't live under ``apps.`` and are excluded structurally, and
* infrastructure apps under ``apps.`` (accounts/users, core audit log,
  the sync's own log) are excluded by name.

Each business table gets one worksheet with a user-friendly name derived
from the model ("workforce_employee" → "Employees").  Column values are
flattened to spreadsheet-safe scalars; secret columns (password hashes,
device tokens) are dropped.
"""
import datetime
import decimal
import json
import logging
import uuid

from django.apps import apps as django_apps
from django.db import models as dj_models

from apps.sheets_sync.client import Formula

logger = logging.getLogger(__name__)

# Package prefix that marks this project's own (business) apps.
BUSINESS_APP_PREFIX = "apps."

# Apps under apps.* that are infrastructure, not business data.
EXCLUDED_APP_LABELS = {
    "accounts",     # users / OTP — authentication data
    "core",         # audit log — system plumbing
    "sheets_sync",  # our own SyncLog — mirroring it would recurse forever
}

# Model-level excludes (app_label.ModelName), if ever needed.
EXCLUDED_MODELS = set()

# Columns stripped from every table they appear in.
SENSITIVE_COLUMNS = {"password", "fcm_token"}

MAX_CELL_LEN = 49500


def is_synced(model):
    """True when ``model`` is a concrete Farm ERP business table."""
    meta = model._meta
    if meta.abstract or meta.proxy or not meta.managed:
        return False
    if meta.app_label in EXCLUDED_APP_LABELS or meta.label in EXCLUDED_MODELS:
        return False
    try:
        app_name = django_apps.get_app_config(meta.app_label).name
    except LookupError:
        return False
    # auth_*, django_*, third-party tables all fail this test structurally.
    return app_name.startswith(BUSINESS_APP_PREFIX)


def iter_synced_models():
    """All business models whose table should have a worksheet."""
    for model in django_apps.get_models(include_auto_created=True):
        if is_synced(model):
            yield model


# ---------------------------------------------------------------------------
# Worksheet naming — user-friendly titles
# ---------------------------------------------------------------------------

_titles = None  # model -> title, built once per process


def _friendly_title(model):
    """
    "workforce_employee" → "Employees", "finance_revenueentry" →
    "Revenue Entries".  Regular models use their verbose_name_plural;
    auto-created M2M through tables humanize their table name instead
    (their generated verbose names are unreadable).
    """
    import re

    meta = model._meta
    if meta.auto_created:
        name = meta.db_table
        prefix = f"{meta.app_label}_"
        if name.startswith(prefix):
            name = name[len(prefix):]
        title = name.replace("_", " ").strip().title()
    else:
        title = str(meta.verbose_name_plural).strip().title()
    # Django's default plural just appends "s" — repair "Historys",
    # "Entrys", "Activitys" → "Histories", "Entries", "Activities".
    return re.sub(r"([^aeiouAEIOU\s])ys\b", r"\1ies", title)


def _build_titles():
    """Assign every synced model a unique title, disambiguating clashes
    (payroll.Payment vs finance.Payment) with the app name."""
    by_title = {}
    for model in iter_synced_models():
        by_title.setdefault(_friendly_title(model), []).append(model)
    titles = {}
    for title, models in by_title.items():
        if len(models) == 1:
            titles[models[0]] = title
        else:
            for model in models:
                titles[model] = f"{model._meta.app_label.title()} {title}"
    return titles


def worksheet_title(model):
    """User-friendly worksheet name for one business table (stable and
    unique within the spreadsheet)."""
    global _titles
    if _titles is None:
        _titles = _build_titles()
    return _titles.get(model) or _friendly_title(model)


def field_columns(model):
    """
    Ordered concrete DB columns for the model, minus secrets.  The primary
    key is forced into the first position — upserts and deletes locate a
    record by matching column A against the pk.
    """
    pk = model._meta.pk
    rest = [
        f for f in model._meta.concrete_fields
        if f is not pk and f.column not in SENSITIVE_COLUMNS
    ]
    return [pk] + rest


def headers(model):
    """
    Worksheet header row.  Image columns get a companion ``<col>_preview``
    column holding an ``=IMAGE(url)`` formula so the picture renders inline.
    """
    cols = []
    for f in field_columns(model):
        cols.append(f.column)
        if isinstance(f, dj_models.ImageField):
            cols.append(f"{f.column}_preview")
    return cols


def _file_url(fieldfile):
    """
    Public URL for a FileField/ImageField value.

    Files stay in Supabase Storage (a public bucket served via the CDN);
    only the URL is mirrored to the spreadsheet.  Falls back to the raw
    storage path if the storage backend cannot build a URL.
    """
    name = getattr(fieldfile, "name", "") or ""
    if not name:
        return ""
    if str(name).startswith(("http://", "https://")):
        return str(name)
    try:
        return fieldfile.url
    except Exception:
        logger.warning("[SheetsSync] Could not resolve URL for file %r", name)
        return str(name)


def _image_preview(url):
    """``=IMAGE(url)`` formula cell (empty when there is no image)."""
    if not url or not url.startswith(("http://", "https://")):
        return ""
    return Formula('=IMAGE("%s")' % url.replace('"', '""'))


def _flatten(value):
    """Convert one field value into a spreadsheet-safe scalar."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, decimal.Decimal):
        return str(value)
    if isinstance(value, (datetime.datetime, datetime.date, datetime.time)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (dict, list)):
        try:
            return json.dumps(value, default=str)[:MAX_CELL_LEN]
        except (TypeError, ValueError):
            return str(value)[:MAX_CELL_LEN]
    return str(value)[:MAX_CELL_LEN]


def serialize_instance(instance):
    """
    (headers, row) for one saved model instance.  The first column is always
    the primary key — upserts and deletes key on it.  Files are mirrored as
    their public Supabase Storage URL; images additionally get a preview
    column rendering the picture via ``=IMAGE(url)``.
    """
    model = type(instance)
    row = []
    for f in field_columns(model):
        value = f.value_from_object(instance)
        if isinstance(f, dj_models.FileField):
            url = _file_url(value)
            row.append(url)
            if isinstance(f, dj_models.ImageField):
                row.append(_image_preview(url))
        else:
            row.append(_flatten(value))
    return headers(model), row


def get_model(app_label, model_name):
    return django_apps.get_model(app_label, model_name)


def model_for_table(table):
    """Synced model for a worksheet title (or a legacy db_table name)."""
    for model in iter_synced_models():
        if worksheet_title(model) == table or model._meta.db_table == table:
            return model
    return None
