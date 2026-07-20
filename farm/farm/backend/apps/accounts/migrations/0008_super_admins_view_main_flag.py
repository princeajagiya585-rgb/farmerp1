"""Add `is_main_admin` to the `super_admins` view.

Keeps the view aligned with Administration → Super Admin Accounts, which marks
the owner account with a "MAIN" badge: the single `is_superuser` account that
may create and manage other super admins. Passwords are deliberately absent —
they exist only as one-way hashes and are never exposed.
"""
from django.db import migrations

POSTGRES_VIEW = """
CREATE OR REPLACE VIEW super_admins AS
SELECT
    u.id,
    u.username,
    COALESCE(
        NULLIF(BTRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
        u.username
    ) || ' (A)' AS full_name,
    u.is_superuser AS is_main_admin,
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

SQLITE_VIEW = """
CREATE VIEW super_admins AS
SELECT
    u.id,
    u.username,
    COALESCE(
        NULLIF(TRIM(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, ''))), ''),
        u.username
    ) || ' (A)' AS full_name,
    u.is_superuser AS is_main_admin,
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
    # Postgres won't CREATE OR REPLACE a view whose column list changed, and
    # SQLite has no REPLACE at all — drop first in both cases.
    schema_editor.execute(DROP_VIEW)
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(POSTGRES_VIEW)
    elif schema_editor.connection.vendor == "sqlite":
        schema_editor.execute(SQLITE_VIEW)


def drop_view(apps, schema_editor):
    schema_editor.execute(DROP_VIEW)


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0007_super_admins_view"),
    ]

    operations = [
        migrations.RunPython(create_view, drop_view),
    ]
