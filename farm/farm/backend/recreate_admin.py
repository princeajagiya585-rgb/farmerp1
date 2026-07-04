import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from apps.accounts.models import User, Role

def recreate_risingyeti_admin():
    # Check if user already exists
    if User.objects.filter(username="risingyeti").exists():
        print("User 'risingyeti' already exists!")
        user = User.objects.get(username="risingyeti")
        user.is_active = True
        user.role = Role.SUPER_ADMIN
        user.save()
        print("User reactivated and set to SUPER_ADMIN.")
        return

    # Create new super admin user
    user = User.objects.create_superuser(
        username="risingyeti",
        email="risingyeti00@gmail.com",
        password="Admin@123"  # You can change this after creation!
    )
    user.role = Role.SUPER_ADMIN
    user.is_active = True
    user.save()
    print("Successfully recreated 'risingyeti' admin user!")
    print("Username: risingyeti")
    print("Password: Admin@123")
    print("Please change the password after logging in!")

if __name__ == "__main__":
    recreate_risingyeti_admin()
