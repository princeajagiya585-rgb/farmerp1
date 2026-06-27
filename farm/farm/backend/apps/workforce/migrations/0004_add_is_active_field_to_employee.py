from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workforce", "0003_alter_employee_phone"),
    ]

    operations = [
        # NOTE: Employee.is_active is already created by 0001_initial (the model
        # inherits it from OwnedModel). This historical migration is kept as a
        # no-op so previously-migrated databases stay consistent while a fresh
        # database doesn't try to add the same column twice.
        migrations.RunSQL(migrations.RunSQL.noop, migrations.RunSQL.noop),
    ]
