from django.core.management.base import BaseCommand, CommandError
from apps.accounts.models import User


class Command(BaseCommand):
    help = "Update or create the super admin user. Optionally reset password with --password flag."

    def add_arguments(self, parser):
        parser.add_argument(
            "--password",
            type=str,
            default=None,
            help="New password for the super admin (resets even if user already exists)",
        )
        parser.add_argument(
            "--username",
            type=str,
            default="risingyeti",
            help="Username of the super admin (default: risingyeti)",
        )

    def handle(self, *args, **options):
        username = options["username"]
        new_password = options.get("password") or "risingyeti123"

        user, created = User.objects.update_or_create(
            username=username,
            defaults={
                "email": "risingyeti00@gmail.com",
                "phone": "+91 74879 37443",
                "role": "SUPER_ADMIN",
                "is_staff": True,
                "is_superuser": True,
                "is_active": True,
            }
        )

        # Always reset the password to the default / provided value
        user.set_password(new_password)
        user.save(update_fields=["password"])

        if created:
            self.stdout.write(self.style.SUCCESS(f"✅ Super admin '{username}' created successfully!"))
        else:
            self.stdout.write(self.style.SUCCESS(f"✅ Super admin '{username}' password reset successfully!"))

        self.stdout.write(f"  Username: {user.username}")
        self.stdout.write(f"  Email: {user.email}")
        self.stdout.write(f"  Phone: {user.phone}")
        self.stdout.write(self.style.WARNING(f"  Password: {new_password}"))
        self.stdout.write(self.style.WARNING("  - Please change this password immediately after logging in!"))
