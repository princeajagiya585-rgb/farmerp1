
import os
import django

# Set up Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from apps.accounts.models import User
from apps.workforce.models import Employee

# Role to category mapping
role_to_category = {
    "SUPER_ADMIN": "SUPER_ADMIN",
    "FARM_MANAGER": "MANAGER",
    "EMPLOYEE": "EMPLOYEE",
}

print("Syncing employee categories...")
count = 0

# Iterate all users
for user in User.objects.all():
    # Get linked employee
    employee = Employee.objects.filter(user=user).first()
    if employee:
        target_category = role_to_category.get(user.role)
        if target_category and employee.category != target_category:
            print(f"Updating {user.username} ({user.role}): {employee.category} → {target_category}")
            employee.category = target_category
            employee.save()
            count +=1

print(f"\nDone! Updated {count} employees.")
