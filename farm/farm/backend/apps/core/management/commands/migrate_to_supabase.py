"""
Management command to migrate all existing uploaded files from the local
filesystem (``MEDIA_ROOT``) to Supabase Storage.

After migration the database records point to the same relative path
(e.g. ``avatars/uuid.jpg``) but the storage backend resolves it to the
Supabase CDN URL instead of ``/media/...``.

Usage::

    python manage.py migrate_to_supabase
    python manage.py migrate_to_supabase --dry-run   # preview only
    python manage.py migrate_to_supabase --app accounts   # single app

All image fields across the following models are migrated:

    accounts.User.avatar, accounts.User.aadhaar_photo
    workforce.Employee.photo
    workforce.Attendance.check_in_photo, .check_out_photo
    assets.Asset.photo
    agronomy.Crop.photo
    breakdowns.BreakdownReport.photo
    documents.Document.file, DocumentVersion.file
    farms.FarmDocument.document
    finance.Expense.bill_file, .Purchase.bill_file, .Payment.bill_file
    finance.CostCenter.bill_file, .Sale.bill_file
    gps.LocationPing.photo, FieldActivity.photo, ActivityPhoto.photo
    tasks.Task.photo
"""

import os
from pathlib import Path

from django.apps import apps
from django.conf import settings
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError

FIELD_REGISTRY = [
    ("accounts", "User", ["avatar", "aadhaar_photo"]),
    ("workforce", "Employee", ["photo"]),
    ("workforce", "Attendance", ["check_in_photo", "check_out_photo"]),
    ("assets", "Asset", ["photo"]),
    ("agronomy", "Crop", ["photo"]),
    ("breakdowns", "BreakdownReport", ["photo"]),
    ("documents", "Document", ["file"]),
    ("documents", "DocumentVersion", ["file"]),
    ("farms", "FarmDocument", ["document"]),
    ("finance", "Expense", ["bill_file"]),
    ("finance", "Purchase", ["bill_file"]),
    ("finance", "Payment", ["bill_file"]),
    ("finance", "CostCenter", ["bill_file"]),
    ("finance", "Sale", ["bill_file"]),
    ("gps", "LocationPing", ["photo"]),
    ("gps", "FieldActivity", ["photo"]),
    ("gps", "ActivityPhoto", ["photo"]),
    ("tasks", "Task", ["photo"]),
]


class Command(BaseCommand):
    help = "Migrate existing uploaded files from MEDIA_ROOT to Supabase Storage."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Only list files that would be migrated, without uploading.",
        )
        parser.add_argument(
            "--app",
            default=None,
            help="Only migrate fields from a specific app (e.g. 'accounts').",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        app_filter = options["app"]

        # Check Supabase is configured
        supabase_url = getattr(settings, "SUPABASE_URL", "")
        supabase_key = getattr(settings, "SUPABASE_SERVICE_KEY", "")
        if not supabase_url or not supabase_key:
            raise CommandError(
                "Supabase Storage is not configured. "
                "Set SUPABASE_URL and SUPABASE_SERVICE_KEY first."
            )

        # Check storage backend
        backend = getattr(settings, "STORAGES", {}).get("default", {}).get("BACKEND", "")
        if "SupabaseFileStorage" not in backend:
            self.stdout.write(
                self.style.WARNING(
                    "DEFAULT_FILE_STORAGE is not SupabaseFileStorage. "
                    "Set SUPABASE_URL and SUPABASE_SERVICE_KEY in your .env.\n"
                )
            )

        self.stdout.write(
            f"Scanning for files to migrate "
            + (f"(app filter: {app_filter})" if app_filter else "(all apps)")
            + (" — DRY RUN (no uploads)\n" if dry_run else "\n")
        )

        total_files = 0
        total_uploaded = 0
        total_skipped = 0
        total_errors = 0

        for app_label, model_name, fields in FIELD_REGISTRY:
            if app_filter and app_label != app_filter:
                continue

            try:
                model = apps.get_model(app_label, model_name)
            except LookupError:
                self.stdout.write(
                    self.style.WARNING(f"  Model {app_label}.{model_name} not found — skipping")
                )
                continue

            queryset = model.objects.all()
            count = queryset.count()
            if count == 0:
                continue

            self.stdout.write(f"\n[{app_label}.{model_name}] ({count} records)")

            for instance in queryset:
                for field_name in fields:
                    field_file = getattr(instance, field_name, None)
                    if not field_file or not field_file.name:
                        continue

                    local_path = field_file.name
                    total_files += 1

                    # Check if the file actually exists on disk
                    full_path = Path(settings.MEDIA_ROOT) / local_path
                    if not full_path.exists():
                        self.stdout.write(
                            f"    ⚠  {local_path} — file not found on disk, skipping"
                        )
                        total_skipped += 1
                        continue

                    # Check if the file is already in Supabase (stored path starts with bucket prefix)
                    if local_path.startswith("uploads/"):
                        total_skipped += 1
                        continue

                    if dry_run:
                        self.stdout.write(f"    → {local_path}")
                        continue

                    # Upload to Supabase
                    try:
                        with open(full_path, "rb") as f:
                            content = f.read()

                        from apps.core.storage import SupabaseFileStorage
                        storage = SupabaseFileStorage()

                        # Use the same relative path in Supabase
                        storage._save(local_path, content)

                        self.stdout.write(
                            self.style.SUCCESS(f"    ✓ {local_path}")
                        )
                        total_uploaded += 1
                    except Exception as e:
                        self.stdout.write(
                            self.style.ERROR(f"    ✗ {local_path} — {e}")
                        )
                        total_errors += 1

        # Summary
        self.stdout.write("\n" + "=" * 60)
        if dry_run:
            self.stdout.write(
                f"DRY RUN: {total_files} file(s) would be migrated "
                f"({total_skipped} skipped)."
            )
        else:
            self.stdout.write(
                f"Migrated {total_uploaded} / {total_files} file(s) "
                f"({total_skipped} skipped, {total_errors} errors)."
            )
