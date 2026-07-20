
"""Automate HR management workflows on Employee creation."""
import uuid
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.utils import timezone

from apps.accounts.models import User, Role
from .models import Employee, EmploymentHistory, Availability


def link_matching_employee(user, farm, category):
    """Claim an existing Employee on ``farm`` for ``user``, if one matches.

    Matched on name or phone, so that giving an already-registered worker a
    login reuses their record instead of creating a second one for the same
    person. Restricted to a single farm and to records no other user holds:
    farms are tenant boundaries, and an already-linked record belongs to
    somebody else's login. Returns the Employee, or None when nothing matched.
    """
    from django.db.models import Q

    if not (user.first_name or user.last_name or user.phone):
        return None

    name_q = Q()
    if user.first_name:
        name_q &= Q(first_name__iexact=user.first_name)
    if user.last_name:
        name_q &= Q(last_name__iexact=user.last_name)
    if user.phone:
        name_q |= Q(phone=user.phone)

    employee = Employee.objects.filter(name_q, farm=farm, user__isnull=True).first()
    if not employee:
        return None

    employee.user = user
    employee.category = category
    employee.save(update_fields=["user", "category"])
    if not user.farms.filter(id=farm.id).exists():
        user.farms.add(farm)
    return employee


@receiver(post_save, sender=Employee)
def employee_created(sender, instance, created, **kwargs):
    if kwargs.get("raw"):
        return  # skip during loaddata (fixtures)
    """When Employee/Labour is created:
    1. Create EmploymentHistory entry with JOINED event
    2. Create Availability record as AVAILABLE from joining date

    NOTE: Attendance records are auto-created with Pending status each day
    via today_status endpoint, the list view, or the create_daily_attendance
    management command run on schedule. Actual check-in updates the record.
    """
    if created:
        effective_date = instance.date_of_joining or timezone.now().date()

        # Create employment history record
        EmploymentHistory.objects.create(
            employee=instance,
            event_type=EmploymentHistory.Event.JOINED,
            designation=instance.designation or "",
            department=instance.department,
            effective_date=effective_date,
            notes="Employee record created"
        )

        # Create availability record - employee is available from their join date
        Availability.objects.create(
            employee=instance,
            start_date=effective_date,
            status=Availability.Status.AVAILABLE,
            reason="New employee / labour joined"
        )


@receiver(post_save, sender=User)
def user_created_for_employee(sender, instance, created, **kwargs):
    if kwargs.get("raw"):
        return  # skip during loaddata (fixtures)
    """When a User is created or updated (any role: SUPER_ADMIN, FARM_MANAGER, EMPLOYEE):
    - Creation: Link to existing Employee or create a new one with category from role
    - Update: Sync the linked Employee's category when the user's role changes
    """
    # Skip when only is_active is being changed (suspend/activate actions)
    update_fields = kwargs.get("update_fields")
    if update_fields is not None:
        # Handle all iterable types (list, tuple, frozenset, set)
        if set(update_fields) == {"is_active"}:
            return

    # Map user role to employee category
    role_to_category = {
        Role.SUPER_ADMIN: Employee.Category.SUPER_ADMIN,
        Role.FARM_MANAGER: Employee.Category.MANAGER,
        Role.EMPLOYEE: Employee.Category.EMPLOYEE,
    }
    target_category = role_to_category.get(instance.role)
    if not target_category:
        return  # Unknown role, skip

    try:
        # Check if user already has a linked employee profile
        existing_employee = Employee.objects.filter(user=instance).first()

        if existing_employee:
            # Only re-sync the category when the employee is still on a base
            # login-role category (SUPER_ADMIN/MANAGER/EMPLOYEE). A manually
            # assigned expanded category (DRIVER, SECURITY, SUPERVISOR, ...)
            # must NOT be clobbered on every unrelated User.save().
            base_categories = {
                Employee.Category.SUPER_ADMIN,
                Employee.Category.MANAGER,
                Employee.Category.EMPLOYEE,
            }
            changed = []
            if (
                existing_employee.category in base_categories
                and existing_employee.category != target_category
            ):
                existing_employee.category = target_category
                changed.append("category")

            # Fill identity fields the Employee is still missing from the
            # linked User (a user created before these fields were set keeps
            # an empty profile otherwise). Only blank fields are written, so
            # an Employee edited directly on the Workforce page is never
            # overwritten by an unrelated User.save().
            for emp_field, user_value in (
                ("first_name", instance.first_name),
                ("last_name", instance.last_name),
                ("phone", instance.phone),
            ):
                if user_value and not getattr(existing_employee, emp_field):
                    setattr(existing_employee, emp_field, user_value)
                    changed.append(emp_field)

            if changed:
                existing_employee.save(update_fields=changed)
            return

        if not created:
            return  # Don't create new Employee records for existing users without one

        # Which farm this account belongs to. Sign-up passes the farm it just
        # created as ``_bootstrap_farm``; otherwise the farms already assigned
        # to the user decide.
        #
        # There is deliberately NO "just take the first farm in the table"
        # fallback: farms now separate tenants, so an arbitrary farm would drop
        # the account into someone else's data. A user saved without any farm
        # (API create sets the M2M only *after* this signal runs) gets its
        # Employee record from UserViewSet.perform_create instead, once the
        # creator's farms are known.
        farm = getattr(instance, "_bootstrap_farm", None)
        if farm is None:
            farm = instance.farms.first()
        if not farm:
            return

        # Link an existing unclaimed Employee on that same farm — matched by
        # name or phone — before creating a second record for the same person.
        # The farm filter keeps the match inside the account's own tenant.
        matching_employee = link_matching_employee(instance, farm, target_category)
        if matching_employee:
            return

        # Generate unique employee code
        base_code = f"EMP-{instance.username.upper()}"
        employee_code = base_code
        counter = 1
        while Employee.objects.filter(employee_code=employee_code).exists():
            employee_code = f"{base_code}-{counter}"
            counter += 1

        # Create employee profile with dynamic category from user role
        Employee.objects.create(
            user=instance,
            employee_code=employee_code,
            first_name=instance.first_name or instance.username or "Unknown",
            last_name=instance.last_name or "",
            category=target_category,
            employment_type=Employee.EmploymentType.PERMANENT,
            farm=farm,
            phone=instance.phone or "",
            date_of_joining=timezone.now().date()
        )

    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to auto-create/link employee profile for user {instance.username}: {str(e)}")


# NOTE: No post_delete handler for User here.
# When a User is deleted (from the Users admin page), the linked Employee
# record is deliberately preserved (on_delete=SET_NULL) so that all work
# history (attendance, tasks, payroll, etc.) remains intact across every
# other page in the system.
