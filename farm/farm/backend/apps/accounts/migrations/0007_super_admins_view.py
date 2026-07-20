"""`super_admins` — a read-only view of the super-admin roster.

Mirrors the "Super Admins" worksheet (see ``apps/sheets_sync/custom_sheets.py``)
so the same roster is browsable directly in Supabase's Table Editor. It is a
VIEW rather than a copied table: it reads ``accounts_user`` live, so it can
never drift, and it duplicates no PII at rest.

Soft-deleted accounts are excluded, so the view's row count is the current
total number of super admins.
"""
from django.db import migrations

# Postgres (Supabase). CONCAT_WS skips NULLs; string_agg gives a stable
# alphabetical farm list.
POSTGRES_VIEW = """
CREATE OR REPLACE VIEW super_admins AS
SELECT
    u.id,
    u.username,
    -- Matches User.get_full_name(), which appends a role marker so
    -- admin-authored entries are recognizable app-wide. Every row here is a
    -- SUPER_ADMIN, so the marker is always "(A)".
    COALESCE(
        NULLIF(BTRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
        u.username
    ) || ' (A)' AS full_name,
    u.email,
    u.phone,
    u.role,
    u.is_active,
    COALESCE((
        SELECT string_agg(f.name, ', ' ORDER BY f.name)
        FROM accounts_user_farms uf
        JOIN farms_farm f ON f.id = uf.farm_id
        WHERE uf.user_id = u.id
    ), '') AS farms,
    u.date_joined,
    u.last_login,
    u.preferred_language,
    u.aadhaar_number,
    u.aadhaar_photo,
    u.avatar
FROM accounts_user u
WHERE u.role = 'SUPER_ADMIN'
  AND u.deleted_at IS NULL;
"""

# SQLite (local dev) — same shape, different string functions, so local and
# prod expose an identical view.
SQLITE_VIEW = """
CREATE VIEW super_admins AS
SELECT
    u.id,
    u.username,
    -- See the Postgres variant: mirrors User.get_full_name()'s "(A)" marker.
    COALESCE(
        NULLIF(TRIM(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, ''))), ''),
        u.username
    ) || ' (A)' AS full_name,
    u.email,
    u.phone,
    u.role,
    u.is_active,
    COALESCE((
        SELECT group_concat(name, ', ')
        FROM (
            SELECT f.name AS name
            FROM accounts_user_farms uf
            JOIN farms_farm f ON f.id = uf.farm_id
            WHERE uf.user_id = u.id
            ORDER BY f.name
        )
    ), '') AS farms,
    u.date_joined,
    u.last_login,
    u.preferred_language,
    u.aadhaar_number,
    u.aadhaar_photo,
    u.avatar
FROM accounts_user u
WHERE u.role = 'SUPER_ADMIN'
  AND u.deleted_at IS NULL;
"""

DROP_VIEW = "DROP VIEW IF EXISTS super_admins;"


def create_view(apps, schema_editor):
    # CREATE OR REPLACE doesn't exist on SQLite, so drop first either way —
    # this also makes the migration safely re-runnable.
    schema_editor.execute(DROP_VIEW)
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(POSTGRES_VIEW)
    elif schema_editor.connection.vendor == "sqlite":
        schema_editor.execute(SQLITE_VIEW)
    # Any other backend: skip rather than fail the deploy.


def drop_view(apps, schema_editor):
    schema_editor.execute(DROP_VIEW)


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0006_add_soft_delete_fields"),
    ]

    operations = [
        migrations.RunPython(create_view, drop_view),
    ]
