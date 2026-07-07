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
def sync_manager_on_role_change(sender, instance, created, **kwargs):
    if kwargs.get("raw"):
        return  # skip during loaddata (fixtures)
    _sync_manager(instance)
    # NOTE: Employee auto-creation/linking for ALL roles (including
    # FARM_MANAGER) is handled by apps.workforce.signals.user_created_for_employee,
    # which generates a unique employee_code. Do not duplicate it here — a
    # second copy created Employees with a blank (non-unique) employee_code,
    # causing an IntegrityError/500 on the second such user.
