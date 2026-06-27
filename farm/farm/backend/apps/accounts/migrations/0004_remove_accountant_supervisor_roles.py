# Generated for FarmERP Pro — drop ACCOUNTANT & SUPERVISOR roles
from django.db import migrations, models


def downgrade_removed_roles(apps, schema_editor):
    """Reassign any existing ACCOUNTANT/SUPERVISOR users to EMPLOYEE."""
    User = apps.get_model("accounts", "User")
    User.objects.filter(role__in=["ACCOUNTANT", "SUPERVISOR"]).update(role="EMPLOYEE")


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_otp'),
    ]

    operations = [
        migrations.RunPython(downgrade_removed_roles, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(
                choices=[
                    ('SUPER_ADMIN', 'Super Administrator'),
                    ('FARM_MANAGER', 'Farm Manager'),
                    ('EMPLOYEE', 'Employee / Labour'),
                ],
                default='EMPLOYEE',
                max_length=20,
            ),
        ),
    ]
