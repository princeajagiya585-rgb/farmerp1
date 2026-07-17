"""
One-time (re-runnable) migration of existing Supabase data to Google Sheets.

Run this BEFORE relying on live sync so the spreadsheet starts from a
complete copy:

    python manage.py sheets_backfill

It opens the existing spreadsheet pinned by GOOGLE_SPREADSHEET_ID (never
creating one), creates one worksheet per Supabase table, and rewrites
each worksheet from the current table contents.  Safe to re-run — every
run replaces worksheet contents with the database truth.
"""
import time

from django.core.management.base import BaseCommand, CommandError

from apps.sheets_sync import client, conf, registry


class Command(BaseCommand):
    help = "Copy all existing Supabase rows into the Google Spreadsheet (one worksheet per table)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--tables",
            nargs="*",
            help="Optional list of table names (worksheet titles) to backfill. Default: all.",
        )

    def handle(self, *args, **options):
        if not conf.credentials_configured():
            raise CommandError(
                "Google credentials missing. Put the service-account JSON in "
                "backend/credentials/ or set GOOGLE_SERVICE_ACCOUNT_JSON / "
                "GOOGLE_SERVICE_ACCOUNT_FILE."
            )
        if not conf.spreadsheet_id():
            raise CommandError(
                "GOOGLE_SPREADSHEET_ID is not set. Point it at your existing "
                "spreadsheet — run `python manage.py sheets_check` to verify."
            )

        only = set(options.get("tables") or [])

        sh = client.get_spreadsheet()
        self.stdout.write(self.style.SUCCESS(
            f"Spreadsheet: {sh.title}  ->  https://docs.google.com/spreadsheets/d/{sh.id}"
        ))

        from apps.sheets_sync.models import SyncLog

        models = list(registry.iter_synced_models())
        total_rows = 0
        failed_tables = []
        for i, model in enumerate(models, 1):
            title = registry.worksheet_title(model)
            if only and title not in only:
                continue

            headers = registry.headers(model)
            rows = [
                registry.serialize_instance(obj)[1]
                for obj in model._base_manager.all().iterator(chunk_size=500)
            ]
            try:
                client.replace_all_rows(title, headers, rows)
            except Exception as exc:
                failed_tables.append(title)
                SyncLog.objects.create(
                    table_name=title, operation=SyncLog.OP_BACKFILL,
                    status=SyncLog.STATUS_FAILED,
                    error=f"{type(exc).__name__}: {exc}"[:4000])
                self.stderr.write(self.style.ERROR(
                    f"  [{i}/{len(models)}] {title}: FAILED — {exc}"))
                continue
            SyncLog.objects.create(
                table_name=title, operation=SyncLog.OP_BACKFILL,
                status=SyncLog.STATUS_SUCCESS)
            total_rows += len(rows)
            self.stdout.write(
                f"  [{i}/{len(models)}] {title}: {len(rows)} rows"
            )
            # Each table costs a handful of API calls; pace to respect the
            # 60 requests/min/user quota on large schemas.
            time.sleep(1.1)

        if failed_tables:
            raise CommandError(
                f"{len(failed_tables)} table(s) failed: "
                f"{', '.join(failed_tables)} — re-run "
                f"`sheets_backfill --tables {' '.join(failed_tables)}`."
            )
        self.stdout.write(self.style.SUCCESS(
            f"Done. {total_rows} rows across {len(models)} tables mirrored to Google Sheets."
        ))
        self.stdout.write(
            "Live sync will keep the spreadsheet updated after every "
            "successful Supabase write."
        )
