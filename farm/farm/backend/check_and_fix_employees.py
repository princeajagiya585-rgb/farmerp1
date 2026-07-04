
import os
import django

# Set up Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from apps.workforce.models import Employee
from apps.accounts.models import User

print("Checking employee categories:")
print("="*50)
count = 0
fixed = 0
valid = {"EMPLOYEE", "LABOUR", "MANAGER", "SUPER_ADMIN"}
role_to_category = {
    "SUPER_ADMIN": "SUPER_ADMIN",
    "FARM_MANAGER": "MANAGER",
    "EMPLOYEE": "EMPLOYEE"
}

for emp in Employee.objects.all():
    count +=1
    print(f"{count}. {emp.name} - {emp.category} - user: {emp.user.username if emp.user else 'NO USER'}")
    if emp.category not in valid:
        print(f"⚠️ INVALID CATEGORY!")
        if emp.user:
            target = role_to_category.get(emp.user.role, "LABOUR")
            print(f"  Fixing to: {target}")
            emp.category = target
            emp.save()
            fixed +=1
        else:
            emp.category = "LABOUR"
            emp.save()
            fixed +=1

print(f"✅ Fixed {fixed} employees out of {count}.")
