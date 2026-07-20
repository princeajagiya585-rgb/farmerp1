from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender="farms.Farm")
def add_super_admins_to_new_farm(sender, instance, created, **kwargs):
    """Every super admin is a member of every farm.

    Farm scoping is enforced for *all* roles — ``apps.core.tenancy.GLOBAL_ROLES``
    is deliberately empty, so nobody bypasses the boundary. A super admin
    therefore only reaches a farm's data by being a member of it. Without this,
    a newly created farm is invisible to existing super admins, and the
    attendance report (which lists every employee for a super admin) shows rows
    whose underlying records they cannot read or delete.

    The counterpart for a newly created/promoted super admin lives in
    ``apps.accounts.signals.add_all_farms_to_super_admin``.
    """
    if kwargs.get("raw") or not created:
        return
    from apps.accounts.models import Role, User

    for user in User.objects.filter(role=Role.SUPER_ADMIN):
        user.farms.add(instance)


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
