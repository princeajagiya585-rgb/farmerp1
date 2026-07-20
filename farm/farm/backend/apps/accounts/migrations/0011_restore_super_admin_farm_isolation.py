from django.db import migrations


def restore_isolation(apps, schema_editor):
    """Undo 0010: put every super admin back on their own farm(s) only.

    0010 made every super admin a member of every farm. That is wrong here —
    each super admin is a separate tenant who runs the farm created with their
    account (see ``accounts.views.register_super_admin``, which warns that the
    wrong farm would "drop a brand-new admin straight into another tenant's
    data"). The blanket membership did exactly that, and it also meant the farm
    created for a new admin was added to the admin who created them.

    A super admin's rightful farms are reconstructed as:
      * the farm on their linked Employee record (their bootstrap farm), plus
      * any farm they are the manager of.

    Both are set at sign-up, so this reproduces the pre-0010 assignment. An
    admin who ends up with nothing matched is left untouched rather than
    stripped of all access.
    """
    User = apps.get_model("accounts", "User")
    Farm = apps.get_model("farms", "Farm")
    Employee = apps.get_model("workforce", "Employee")

    for user in User.objects.filter(role="SUPER_ADMIN"):
        own = set(
            Farm.objects.filter(manager=user).values_list("id", flat=True)
        )
        own |= set(
            Employee.objects.filter(user=user, farm__isnull=False).values_list(
                "farm_id", flat=True
            )
        )
        if not own:
            # Nothing to reconstruct from — leave this account's access alone
            # rather than locking it out of every farm.
            continue
        user.farms.set(list(own))


def noop(apps, schema_editor):
    """Not reversed: re-granting every farm is what this migration undoes."""


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0010_super_admins_all_farms"),
        ("workforce", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(restore_isolation, noop),
    ]
