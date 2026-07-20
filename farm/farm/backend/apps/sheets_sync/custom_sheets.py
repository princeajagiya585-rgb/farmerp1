"""
Curated worksheets that are not a plain one-model-one-table mirror.

The normal registry mirrors a whole business table (see ``registry.py``).
Some sheets are instead a *filtered view* of a table that the registry
deliberately excludes — e.g. "Super Admins", a roster of the owner
accounts drawn from ``accounts.User`` (an app excluded from the automatic
mirror because it holds authentication data).

A custom sheet is defined by a builder returning ``(title, headers, rows)``
and is always written whole via ``client.replace_all_rows`` — these sheets
are small, so a full rewrite is cheaper and simpler than a keyed upsert.
"""
import logging

from apps.sheets_sync.registry import _flatten, _file_url, _image_preview

logger = logging.getLogger(__name__)

SUPER_ADMINS = "super_admins"

SUPER_ADMINS_TITLE = "Super Admins"

SUPER_ADMINS_HEADERS = [
    "id",
    "username",
    "full_name",
    "email",
    "phone",
    "role",
    "is_active",
    "farms",
    "date_joined",
    "last_login",
    "preferred_language",
    "aadhaar_number",
    "aadhaar_photo",
    "aadhaar_photo_preview",
    "avatar",
    "avatar_preview",
]


def build_super_admins():
    """(title, headers, rows) — one row per SUPER_ADMIN account.

    Soft-deleted accounts (``deleted_at`` set) are left out so the sheet
    always reflects the live roster; its row count is the current total.
    """
    from apps.accounts.models import Role, User

    users = (
        User.objects.filter(role=Role.SUPER_ADMIN, deleted_at__isnull=True)
        .prefetch_related("farms")
        .order_by("date_joined")
    )

    rows = []
    for u in users:
        aadhaar_url = _file_url(u.aadhaar_photo)
        avatar_url = _file_url(u.avatar)
        rows.append([
            _flatten(u.id),
            _flatten(u.username),
            _flatten(u.get_full_name() or u.username),
            _flatten(u.email),
            _flatten(u.phone),
            _flatten(u.role),
            _flatten(u.is_active),
            _flatten(", ".join(sorted(f.name for f in u.farms.all()))),
            _flatten(u.date_joined),
            _flatten(u.last_login),
            _flatten(u.preferred_language),
            _flatten(u.aadhaar_number),
            aadhaar_url,
            _image_preview(aadhaar_url),
            avatar_url,
            _image_preview(avatar_url),
        ])
    return SUPER_ADMINS_TITLE, SUPER_ADMINS_HEADERS, rows


# name -> builder
BUILDERS = {
    SUPER_ADMINS: build_super_admins,
}

TITLES = {
    SUPER_ADMINS: SUPER_ADMINS_TITLE,
}


def build(name):
    return BUILDERS[name]()


def title_for(name):
    return TITLES.get(name, name)
