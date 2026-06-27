from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.workforce.models import Employee

User = get_user_model()


class Command(BaseCommand):
    help = 'Sync employee farm from user farms'

    def handle(self, *args, **options):
        count = 0
        for user in User.objects.filter(role__in=['EMPLOYEE', 'FARM_MANAGER']):
            farms = list(user.farms.all())
            if not farms:
                continue

            employee = Employee.objects.filter(user=user).first()
            if employee:
                if employee.farm != farms[0]:
                    employee.farm = farms[0]
                    employee.save()
                    count += 1
                    self.stdout.write(f'Synced {user.username}: {farms[0].name}')
            else:
                # Create employee if not exists
                Employee.objects.create(
                    user=user,
                    employee_code=f"EMP-{user.username}",
                    first_name=user.first_name or user.username,
                    last_name=user.last_name or "",
                    category=Employee.Category.EMPLOYEE,
                    employment_type=Employee.EmploymentType.PERMANENT,
                    farm=farms[0],
                    phone=user.phone,
                )
                count += 1
                self.stdout.write(f'Created employee for {user.username} with farm {farms[0].name}')

        self.stdout.write(self.style.SUCCESS(f'Synced {count} employees'))