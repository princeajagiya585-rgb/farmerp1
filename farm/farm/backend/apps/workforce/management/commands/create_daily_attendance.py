"""
Management command to create Pending attendance records for all active employees.

Run daily via cron/scheduler at the start of each day:
    python manage.py create_daily_attendance

Or for a specific date / farm:
    python manage.py create_daily_attendance --date 2026-07-10 --farm <farm_id>

If an attendance record already exists for an employee+date, it is skipped
(never overwritten).
"""

from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.workforce.models import Attendance, Employee


class Command(BaseCommand):
    help = "Create Pending attendance records for all active employees for today (or a given date)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--date",
            type=str,
            help="Date in YYYY-MM-DD format (default: today).",
        )
        parser.add_argument(
            "--farm",
            type=str,
            help="Optional farm ID to restrict which employees get records.",
        )

    def handle(self, *args, **options):
        raw_date = options.get("date")
        if raw_date:
            try:
                target_date = date.fromisoformat(raw_date)
            except ValueError:
                self.stderr.write(self.style.ERROR(f"Invalid date format: {raw_date}. Use YYYY-MM-DD."))
                return
        else:
            target_date = timezone.localdate()

        farm_id = options.get("farm")

        # Build employee queryset
        employees = Employee.objects.filter(is_active=True).select_related("farm")
        if farm_id:
            employees = employees.filter(farm_id=farm_id)

        if not employees.exists():
            self.stdout.write(self.style.WARNING("No active employees found."))
            return

        # Find existing attendance records for this date to avoid duplicates
        existing_emp_ids = set(
            Attendance.objects.filter(
                employee__in=employees, date=target_date
            ).values_list("employee_id", flat=True)
        )

        created_count = 0
        skipped_count = 0

        for emp in employees:
            if emp.id in existing_emp_ids:
                skipped_count += 1
                continue

            Attendance.objects.create(
                employee=emp,
                farm=emp.farm,
                date=target_date,
                status=None,  # Pending — no check-in yet
                approval_status=Attendance.ApprovalStatus.PENDING,
            )
            created_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Created {created_count} Pending attendance record(s) for {target_date}. "
                f"Skipped {skipped_count} (already exist)."
            )
        )
