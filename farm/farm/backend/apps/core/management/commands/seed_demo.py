"""Seed the database with demo users, a farm, employees and sample records."""
import datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.models import Role
from apps.agronomy.models import Crop
from apps.farms.models import Farm, Field
from apps.finance.models import Expense
from apps.inventory.models import Item
from apps.tasks.models import Task
from apps.workforce.models import Employee, Attendance

User = get_user_model()


class Command(BaseCommand):
    help = "Seed demo data for FarmERP Pro"

    def add_arguments(self, parser):
        parser.add_argument(
            "--noinput", "--no-input",
            action="store_true",
            help="Skip confirmation prompts (for automated deploys)",
        )

    def handle(self, *args, **options):
        # Skip confirmation when --noinput is passed (automated deploys)
        if not options.get("noinput"):
            self.stdout.write("Running seed_demo... (use --noinput to skip confirmation)")
        # --- Users -------------------------------------------------------
        users = {
            "admin": Role.SUPER_ADMIN,
            "manager": Role.FARM_MANAGER,
            "worker": Role.EMPLOYEE,
        }
        phone_map = {
            "admin": "9999999999",
            "manager": "9999999998",
            "worker": "9999999995",
        }
        created_users = {}
        for username, role in users.items():
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "email": f"{username}@farmerp.local",
                    "role": role,
                    "first_name": username.capitalize(),
                    "phone": phone_map[username],
                    "is_staff": role == Role.SUPER_ADMIN,
                    "is_superuser": role == Role.SUPER_ADMIN,
                },
            )
            if created:
                user.set_password("Passw0rd!")
                user.save()
            else:
                # Ensure phone is set even for existing users
                if not user.phone:
                    user.phone = phone_map[username]
                    user.save(update_fields=["phone"])
            created_users[username] = user
        self.stdout.write(self.style.SUCCESS("Users ready (password: Passw0rd!)"))

        # --- Farm --------------------------------------------------------
        farm, _ = Farm.objects.get_or_create(
            code="GREEN-01",
            defaults={
                "name": "Green Valley Estate",
                "location": "Nashik, Maharashtra",
                "latitude": Decimal("19.9975"),
                "longitude": Decimal("73.7898"),
                "total_area": Decimal("120.50"),
                "manager": created_users["manager"],
            },
        )
        for u in created_users.values():
            if u.role != Role.SUPER_ADMIN:
                u.farms.add(farm)

        field, _ = Field.objects.get_or_create(
            farm=farm, name="Block A", defaults={"code": "A1", "area": Decimal("20"), "soil_type": "Loamy"}
        )

        # --- Workforce ---------------------------------------------------
        emp, _ = Employee.objects.get_or_create(
            employee_code="EMP-001",
            defaults={
                "first_name": "Ramesh",
                "last_name": "Patil",
                "category": "LABOUR",
                "employment_type": "DAILY_WAGE",
                "farm": farm,
                "phone": "9999999999",
                "daily_wage": Decimal("450"),
                "date_of_joining": datetime.date(2024, 1, 15),
            },
        )
        Attendance.objects.get_or_create(
            employee=emp,
            date=timezone.now().date(),
            defaults={"farm": farm, "status": "PRESENT", "approval_status": "APPROVED"},
        )

        # --- Agronomy ----------------------------------------------------
        Crop.objects.get_or_create(
            name="Grapes",
            farm=farm,
            defaults={
                "variety": "Thompson Seedless",
                "field": field,
                "season": "Rabi 2025",
                "status": "GROWING",
                "area": Decimal("20"),
                "expected_yield": Decimal("400"),
            },
        )

        # --- Inventory ---------------------------------------------------
        Item.objects.get_or_create(
            sku="FERT-NPK-01",
            defaults={
                "name": "NPK 19:19:19",
                "category": "FERTILIZER",
                "farm": farm,
                "unit": "kg",
                "current_stock": Decimal("50"),
                "reorder_level": Decimal("100"),
                "unit_cost": Decimal("85"),
            },
        )

        # --- Finance -----------------------------------------------------
        Expense.objects.get_or_create(
            farm=farm,
            description="Diesel for tractor",
            defaults={"category": "FUEL", "amount": Decimal("3500"), "date": timezone.now().date()},
        )

        # --- Tasks -------------------------------------------------------
        Task.objects.get_or_create(
            title="Irrigate Block A",
            farm=farm,
            defaults={
                "description": "Drip irrigation cycle for grapes",
                "field": field,
                "priority": "HIGH",
                "status": "TODO",
                "schedule_type": "DAILY",
                "assigned_to": created_users["worker"],
                "due_date": timezone.now().date(),
            },
        )

        self.stdout.write(self.style.SUCCESS("Demo data seeded successfully."))
        self.stdout.write("Login accounts (password Passw0rd!): admin, manager, worker")
