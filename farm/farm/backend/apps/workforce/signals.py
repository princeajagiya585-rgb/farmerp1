
"""Automate HR management workflows on Employee creation."""
import uuid
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.utils import timezone

from apps.accounts.models import User, Role
from .models import Employee, EmploymentHistory, Availability


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
            if (
                existing_employee.category in base_categories
                and existing_employee.category != target_category
            ):
                existing_employee.category = target_category
                existing_employee.save(update_fields=["category"])
            return

        if not created:
            return  # Don't create new Employee records for existing users without one

        from django.db.models import Q
        from apps.farms.models import Farm

        # Step 1: Try to find an existing Employee that matches this user
        # Match by first_name + last_name, or by phone number
        matching_employee = None
        name_q = Q()
        if instance.first_name:
            name_q &= Q(first_name__iexact=instance.first_name)
        if instance.last_name:
            name_q &= Q(last_name__iexact=instance.last_name)
        if instance.phone:
            name_q |= Q(phone=instance.phone)

        if name_q and (instance.first_name or instance.last_name or instance.phone):
            matching_employee = Employee.objects.filter(name_q).first()

        if matching_employee:
            # Link the user to the existing Employee profile
            matching_employee.user = instance
            matching_employee.category = target_category
            matching_employee.save(update_fields=["user", "category"])

            # Ensure user has the same farm assignment
            if not instance.farms.filter(id=matching_employee.farm_id).exists():
                instance.farms.add(matching_employee.farm)
            return

        # Step 2: No matching Employee found — create a new one
        farm = None
        if instance.farms.exists():
            farm = instance.farms.first()
        else:
            if Farm.objects.exists():
                farm = Farm.objects.first()
                if farm:
                    instance.farms.add(farm)

        if not farm:
            return  # No farms available

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
