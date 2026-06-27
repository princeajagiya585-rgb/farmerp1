from django.core.management.base import BaseCommand
from apps.accounts.models import User


class Command(BaseCommand):
    help = "Update or create the super admin user"

    def handle(self, *args, **options):
        # Check if the user already exists
        user, created = User.objects.update_or_create(
            username="risingyeti",
            defaults={
                "email": "risingyeti00@gmail.com",
                "phone": "+91 74879 37443",
                "role": "SUPER_ADMIN",
                "is_staff": True,
                "is_superuser": True,
                "is_active": True,
            }
        )

        if created:
            user.set_password("risingyeti123")  # Default password - user should change this
            user.save()
            self.stdout.write(self.style.SUCCESS("✅ Super admin user created successfully!"))
        else:
            self.stdout.write(self.style.SUCCESS("✅ Super admin user updated successfully!"))

        self.stdout.write(f"  Username: {user.username}")
        self.stdout.write(f"  Email: {user.email}")
        self.stdout.write(f"  Phone: {user.phone}")
        self.stdout.write(self.style.WARNING("  Default password: risingyeti123"))
        self.stdout.write(self.style.WARNING("  - Please change this password immediately!"))
