from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workforce", "0007_fix_invalid_categories"),
    ]

    operations = [
        migrations.AlterField(
            model_name="employee",
            name="category",
            field=models.CharField(
                choices=[
                    ("EMPLOYEE", "Employee"),
                    ("LABOUR", "Labour"),
                    ("MANAGER", "Manager"),
                    ("SUPERVISOR", "Supervisor"),
                    ("DRIVER", "Driver"),
                    ("SECURITY", "Security"),
                    ("OFFICE_STAFF", "Office Staff"),
                    ("ACCOUNTANT", "Accountant"),
                    ("TECHNICIAN", "Technician"),
                    ("SUPER_ADMIN", "Super Administrator"),
                ],
                default="LABOUR",
                max_length=20,
            ),
        ),
    ]
