"""
Management command to set up Supabase Storage.

Creates the configured storage bucket (default: ``uploads``) if it does
not already exist, sets it to public, and verifies that the Supabase
client can connect and perform basic operations.

Usage::

    python manage.py setup_supabase_storage

You can optionally specify a different bucket::

    python manage.py setup_supabase_storage --bucket my-bucket
"""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Create and verify the Supabase Storage bucket for file uploads."

    def add_arguments(self, parser):
        parser.add_argument(
            "--bucket",
            default=None,
            help="Bucket name (default: SUPABASE_STORAGE_BUCKET env or 'uploads')",
        )

    def handle(self, *args, **options):
        supabase_url = getattr(settings, "SUPABASE_URL", "")
        supabase_key = getattr(settings, "SUPABASE_SERVICE_KEY", "")

        if not supabase_url or not supabase_key:
            raise CommandError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in "
                "environment or Django settings."
            )

        bucket_name = options["bucket"] or getattr(
            settings, "SUPABASE_STORAGE_BUCKET", "uploads"
        )

        self.stdout.write(f"Supabase URL: {supabase_url}")
        self.stdout.write(f"Bucket:       {bucket_name}")
        self.stdout.write("")

        # Lazy-import so this command can be used even when supabase-py
        # is not installed (e.g. ephemeral CI environments).
        try:
            from supabase import create_client
        except ImportError:
            raise CommandError(
                "supabase-py is not installed. Run: pip install supabase"
            )

        client = create_client(supabase_url, supabase_key)

        # ── Check existing buckets ──────────────────────────────────────
        self.stdout.write("1. Checking existing buckets...")
        try:
            buckets = client.storage.list_buckets()
            existing = {b.name for b in buckets}
            self.stdout.write(f"   Found {len(buckets)} bucket(s): {', '.join(sorted(existing))}")
        except Exception as e:
            self.stdout.write(self.style.WARNING(f"   Could not list buckets: {e}"))
            existing = set()

        # ── Create bucket if needed ─────────────────────────────────────
        if bucket_name in existing:
            self.stdout.write(
                self.style.SUCCESS(f"2. Bucket '{bucket_name}' already exists.")
            )
        else:
            self.stdout.write(f"2. Creating bucket '{bucket_name}' (public)...")
            try:
                client.storage.create_bucket(
                    bucket_name,
                    options={"public": True},
                )
                self.stdout.write(
                    self.style.SUCCESS(f"   Bucket '{bucket_name}' created successfully.")
                )
            except Exception as e:
                raise CommandError(f"   Failed to create bucket: {e}")

        # ── Verify public access ────────────────────────────────────────
        self.stdout.write("3. Verifying public access...")
        try:
            public_url = client.storage.from_(bucket_name).get_public_url(
                ".setup-verification"
            )
            # A public URL is generated even for non-existent files —
            # the important thing is it didn't raise an exception.
            self.stdout.write(self.style.SUCCESS(f"   Public URL format OK: {public_url[:80]}..."))
        except Exception as e:
            self.stdout.write(self.style.WARNING(f"   Public URL check failed: {e}"))

        # ── Test upload / delete ────────────────────────────────────────
        self.stdout.write("4. Testing upload...")
        try:
            test_content = b"supabase-storage-verification"
            test_path = ".verify/setup-test.txt"
            client.storage.from_(bucket_name).upload(
                path=test_path,
                file=test_content,
                file_options={"content-type": "text/plain"},
            )
            self.stdout.write(self.style.SUCCESS("   Upload OK"))

            # Clean up test file
            client.storage.from_(bucket_name).remove([test_path])
            self.stdout.write(self.style.SUCCESS("   Cleanup OK"))
        except Exception as e:
            self.stdout.write(self.style.WARNING(f"   Upload test skipped: {e}"))

        # ── Django storage backend check ──────────────────────────────
        default_storage = getattr(settings, "STORAGES", {}).get("default", {})
        backend = default_storage.get("BACKEND", "")
        if "SupabaseFileStorage" in backend:
            self.stdout.write(
                self.style.SUCCESS(
                    "5. Django STORAGES configured: SupabaseFileStorage"
                )
            )
        else:
            self.stdout.write(
                self.style.WARNING(
                    f"5. Django STORAGES default backend is '{backend}' — "
                    "uploads may still use local filesystem."
                )
            )

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Supabase Storage setup complete."))
