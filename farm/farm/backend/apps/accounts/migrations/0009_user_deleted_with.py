import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0008_super_admins_view_main_flag'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='deleted_with',
            field=models.ForeignKey(blank=True, editable=False, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='cascade_deleted_set', to=settings.AUTH_USER_MODEL),
        ),
    ]
