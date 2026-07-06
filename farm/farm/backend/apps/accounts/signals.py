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


def _create_manager_employee(user):
    """Auto-create employee record when a FARM_MANAGER user is created."""
    from apps.accounts.models import Role
    from apps.workforce.models import Employee

    if user.role != Role.FARM_MANAGER:
        return

    # Check if employee already exists for this user
    if Employee.objects.filter(user=user).exists():
        return

    # Get the first assigned farm for the employee (required for employee creation)
    farm = user.farms.first()
    if not farm:
        return  # No farm assigned, can't create employee yet

    # Create employee record
    Employee.objects.create(
        user=user,
        first_name=user.first_name or "",
        last_name=user.last_name or "",
        name=user.get_full_name() or user.username or "",
        phone=user.phone or "",
        category=Employee.Category.MANAGER,
        employment_type=Employee.EmploymentType.PERMANENT,
        farm=farm,
    )


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
    from apps.accounts.models import Role
    _sync_manager(instance)
    # Auto-create employee when FARM_MANAGER user is created OR role is changed to FARM_MANAGER
    if instance.role == Role.FARM_MANAGER:
        _create_manager_employee(instance)
