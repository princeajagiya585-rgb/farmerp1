from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('farms', '0005_farm_check_in_radius'),
    ]

    operations = [
        migrations.AlterField(
            model_name='farm',
            name='latitude',
            field=models.DecimalField(blank=True, decimal_places=15, max_digits=20, null=True),
        ),
        migrations.AlterField(
            model_name='farm',
            name='longitude',
            field=models.DecimalField(blank=True, decimal_places=15, max_digits=20, null=True),
        ),
    ]
