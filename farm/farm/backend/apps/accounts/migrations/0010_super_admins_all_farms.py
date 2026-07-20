from django.db import migrations


def add_all_farms_to_super_admins(apps, schema_editor):
    """Backfill: every existing super admin becomes a member of every farm.

    Farm scoping applies to all roles (``apps.core.tenancy.GLOBAL_ROLES`` is
    empty), so a super admin who was only a member of the farm they were created
    on could not read or delete records on any other farm — while the attendance
    report listed every employee regardless. That mismatch made the report's
    row actions fail for rows outside their own farm.

    Signals keep this true going forward; this migration fixes existing rows.
    """
    User = apps.get_model("accounts", "User")
    Farm = apps.get_model("farms", "Farm")

    farm_ids = list(Farm.objects.values_list("id", flat=True))
    if not farm_ids:
        return
    for user in User.objects.filter(role="SUPER_ADMIN"):
        existing = set(user.farms.values_list("id", flat=True))
        missing = [f for f in farm_ids if f not in existing]
        if missing:
            user.farms.add(*missing)


def noop(apps, schema_editor):
    """Irreversible by design — we cannot tell which memberships pre-existed."""


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0009_user_deleted_with"),
        ("farms", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(add_all_farms_to_super_admins, noop),
    ]
