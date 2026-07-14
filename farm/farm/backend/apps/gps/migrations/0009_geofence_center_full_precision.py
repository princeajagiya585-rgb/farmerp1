from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('gps', '0008_make_lat_lng_nullable'),
    ]

    operations = [
        migrations.AlterField(
            model_name='geofence',
            name='center_lat',
            field=models.DecimalField(blank=True, decimal_places=15, max_digits=20, null=True),
        ),
        migrations.AlterField(
            model_name='geofence',
            name='center_lng',
            field=models.DecimalField(blank=True, decimal_places=15, max_digits=20, null=True),
        ),
    ]
