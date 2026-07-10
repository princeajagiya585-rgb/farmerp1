# Generated manually - make TaskActivity.employee nullable

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('tasks', '0007_alter_taskactivity_address_alter_taskactivity_notes_and_more'),
        ('workforce', '0013_attendance_enhanced_fields'),
    ]

    operations = [
        migrations.AlterField(
            model_name='taskactivity',
            name='employee',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='task_activities',
                to='workforce.employee',
            ),
        ),
    ]
