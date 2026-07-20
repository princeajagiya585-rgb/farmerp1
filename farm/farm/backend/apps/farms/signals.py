from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender="farms.Farm")
def sync_farm_geofence(sender, instance, **kwargs):
    if kwargs.get("raw"):
        return  # skip during loaddata (fixtures)
    if not instance.latitude or not instance.longitude:
        return
    from apps.gps.models import Geofence
    geofence = Geofence.objects.filter(farm=instance).first()
    if geofence:
        geofence.center_lat = instance.latitude
        geofence.center_lng = instance.longitude
        geofence.name = instance.name
        geofence.save(update_fields=["center_lat", "center_lng", "name"])
    else:
        Geofence.objects.create(
            farm=instance,
            name=instance.name,
            center_lat=instance.latitude,
            center_lng=instance.longitude,
            radius_m=0,
        )
