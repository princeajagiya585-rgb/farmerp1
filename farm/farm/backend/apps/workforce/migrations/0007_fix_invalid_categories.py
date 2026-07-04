"""
Data migration: fix existing Employee records with invalid or missing categories.

This migration:
1. Finds any Employee whose category is NULL, blank, or not in the valid set.
2. Sets them to a sensible default based on the linked User's role (if any).
3. Falls back to LABOUR for employees without a linked User.

Valid categories after the 0006 migration:
    EMPLOYEE, LABOUR, MANAGER, SUPER_ADMIN
"""
from django.db import migrations

VALID_CATEGORIES = {"EMPLOYEE", "LABOUR", "MANAGER", "SUPER_ADMIN"}

ROLE_TO_CATEGORY = {
    "SUPER_ADMIN": "SUPER_ADMIN",
    "FARM_MANAGER": "MANAGER",
    "EMPLOYEE": "EMPLOYEE",
}


def fix_invalid_categories(apps, schema_editor):
    Employee = apps.get_model("workforce", "Employee")
    User = apps.get_model("accounts", "User")
    fixed = 0

    for emp in Employee.objects.iterator():
        original = emp.category
        # Check if category is invalid (None, blank, or not in valid set)
        if not original or original.strip() not in VALID_CATEGORIES:
            # Try to determine category from linked user
            if emp.user_id:
                try:
                    user = User.objects.get(pk=emp.user_id)
                    emp.category = ROLE_TO_CATEGORY.get(user.role, "EMPLOYEE")
                except User.DoesNotExist:
                    emp.category = "LABOUR"
            else:
                emp.category = "LABOUR"

            emp.save(update_fields=["category"])
            fixed += 1

    if fixed:
        print(f"  ✓ Fixed {fixed} Employee record(s) with invalid categories.")


def reverse_migration(apps, schema_editor):
    """No-op: we cannot restore the original invalid values."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("workforce", "0006_add_super_admin_category"),
    ]

    operations = [
        migrations.RunPython(fix_invalid_categories, reverse_migration),
    ]
