from django.db.models.signals import post_save
from django.dispatch import receiver


def _sync_manager(user):
    from apps.accounts.models import Role
    if user.role != Role.FARM_MANAGER:
        return
    for farm in user.farms.all():
        if farm.manager_id != user.pk:
            farm.manager = user
            farm.save(update_fields=["manager"])


def sync_manager_on_farm_assign(sender, instance, action, pk_set, **kwargs):
    if action not in ("post_add", "post_remove", "post_clear"):
        return
    from django.contrib.auth import get_user_model
    User = get_user_model()
    if isinstance(instance, User):
        _sync_manager(instance)


@receiver(post_save, sender="accounts.User")
def sync_manager_on_role_change(sender, instance, **kwargs):
    if kwargs.get("raw"):
        return  # skip during loaddata (fixtures)
    _sync_manager(instance)
