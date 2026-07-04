
"""Automate HR management workflows on Employee creation."""
import uuid
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.utils import timezone

from apps.accounts.models import User, Role
from .models import Employee, EmploymentHistory, Attendance, Availability


@receiver(post_save, sender=Employee)
def employee_created(sender, instance, created, **kwargs):
    if kwargs.get("raw"):
        return  # skip during loaddata (fixtures)
    """When Employee/Labour is created:
    1. Create EmploymentHistory entry with JOINED event
    2. Create Availability record as AVAILABLE from joining date
    3. Create Attendance record for joining date with PRESENT status
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

        # Create attendance for the joining date only when they join TODAY, so a
        # back-dated employee doesn't get a phantom paid work-day injected into a
        # past payroll period. Guard against a unique-constraint race (a check-in
        # may already have created today's attendance) breaking the Employee save.
        if effective_date == timezone.localdate():
            from django.db import IntegrityError, transaction
            try:
                with transaction.atomic():
                    Attendance.objects.create(
                        employee=instance,
                        farm=instance.farm,
                        date=effective_date,
                        status=Attendance.Status.PRESENT,
                        approval_status=Attendance.ApprovalStatus.APPROVED,
                    )
            except IntegrityError:
                pass


@receiver(post_save, sender=User)
def user_created_for_employee(sender, instance, created, **kwargs):
    if kwargs.get("raw"):
        return  # skip during loaddata (fixtures)
    """When a User is created (any role: SUPER_ADMIN, FARM_MANAGER, EMPLOYEE):
    1. Link the user to an existing Employee profile (by name + farm) if possible
    2. Otherwise, create a new Employee profile
    3. Assign a farm if not already assigned
    """
    if created:
        # Only workforce employees get an Employee profile — never admins/managers.
        if instance.role != Role.EMPLOYEE:
            return
        try:
            from django.db.models import Q
            from apps.farms.models import Farm

            # Step 1: Check if user already has a linked employee profile
            if hasattr(instance, 'employee_profile') and instance.employee_profile is not None:
                return
            
            # Step 2: Try to find an existing Employee that matches this user
            # Match by first_name + last_name, or by phone number
            existing_employee = None
            name_q = Q()
            if instance.first_name:
                name_q &= Q(first_name__iexact=instance.first_name)
            if instance.last_name:
                name_q &= Q(last_name__iexact=instance.last_name)
            if instance.phone:
                name_q |= Q(phone=instance.phone)
            
            if name_q and (instance.first_name or instance.last_name or instance.phone):
                existing_employee = Employee.objects.filter(name_q).first()
            
            if existing_employee:
                # Link the user to the existing Employee profile
                existing_employee.user = instance
                existing_employee.save(update_fields=["user"])
                
                # Ensure user has the same farm assignment
                if not instance.farms.filter(id=existing_employee.farm_id).exists():
                    instance.farms.add(existing_employee.farm)
                return
            
            # Step 3: No matching Employee found — create a new one
            # Get or create a farm for the user
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
            
            # Create employee profile
            Employee.objects.create(
                user=instance,
                employee_code=employee_code,
                first_name=instance.first_name or instance.username or "Unknown",
                last_name=instance.last_name or "",
                category=Employee.Category.LABOUR,
                employment_type=Employee.EmploymentType.DAILY_WAGE,
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
