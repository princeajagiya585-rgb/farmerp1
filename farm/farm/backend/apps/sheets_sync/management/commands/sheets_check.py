"""
Verify the Google Sheets connection end-to-end:

    python manage.py sheets_check

Authenticates with the service account, opens the spreadsheet pinned by
GOOGLE_SPREADSHEET_ID and lists its worksheets.  Prints
"Google Sheets connection successful." on success; on failure it prints
the exact error plus the concrete fix (most commonly: share the
spreadsheet with the service-account email, or enable the Sheets API).
"""
import json

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.sheets_sync import client, conf


class Command(BaseCommand):
    help = "Test the Google Sheets connection (read-only; changes nothing)."

    def handle(self, *args, **options):
        ok = True

        # -- credentials ---------------------------------------------------
        if getattr(settings, "GOOGLE_SERVICE_ACCOUNT_JSON", ""):
            self.stdout.write("Credentials: GOOGLE_SERVICE_ACCOUNT_JSON (env)")
        elif getattr(settings, "GOOGLE_SERVICE_ACCOUNT_FILE", ""):
            self.stdout.write(
                f"Credentials: {settings.GOOGLE_SERVICE_ACCOUNT_FILE}"
            )
        else:
            ok = False
            self.stderr.write(self.style.ERROR(
                "No Google credentials found. Put the service-account JSON "
                "key in backend/credentials/ (auto-detected) or set "
                "GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_SERVICE_ACCOUNT_FILE."
            ))

        sa_email = None
        if ok:
            try:
                sa_email = client.service_account_email()
                self.stdout.write(f"Service account: {sa_email}")
            except (OSError, json.JSONDecodeError, ValueError) as exc:
                ok = False
                self.stderr.write(self.style.ERROR(
                    f"Credentials file is unreadable or not valid JSON: {exc}"
                ))

        # -- spreadsheet id ------------------------------------------------
        sheet_id = conf.spreadsheet_id()
        if sheet_id:
            self.stdout.write(f"Spreadsheet ID: {sheet_id}")
        else:
            ok = False
            self.stderr.write(self.style.ERROR(
                "GOOGLE_SPREADSHEET_ID is not set. Set it to the ID from "
                "your spreadsheet URL (docs.google.com/spreadsheets/d/<ID>/). "
                "A new spreadsheet is never created."
            ))

        if not ok:
            self.stderr.write(self.style.ERROR(
                "Google Sheets connection failed (configuration incomplete)."
            ))
            raise SystemExit(1)

        # -- live API call ---------------------------------------------------
        try:
            sh = client.get_spreadsheet()
            titles = [ws.title for ws in client.with_retry(sh.worksheets)]
        except Exception as exc:  # print the exact error, then diagnose
            self.stderr.write(self.style.ERROR(f"{type(exc).__name__}: {exc}"))
            self._diagnose(exc, sa_email, sheet_id)
            raise SystemExit(1)

        self.stdout.write(f"Spreadsheet: {sh.title}")
        self.stdout.write(
            f"URL: https://docs.google.com/spreadsheets/d/{sh.id}"
        )
        self.stdout.write(
            f"Worksheets ({len(titles)}): {', '.join(titles) or '(none)'}"
        )
        self.stdout.write(self.style.SUCCESS(
            "Google Sheets connection successful."
        ))

    def _diagnose(self, exc, sa_email, sheet_id):
        """Turn common API failures into the exact next step."""
        text = str(exc)
        code = getattr(getattr(exc, "response", None), "status_code", None)

        if code == 403 or "PERMISSION_DENIED" in text:
            if "has not been used in project" in text or "is disabled" in text:
                self.stderr.write(self.style.WARNING(
                    "Fix: the Google Sheets API is disabled for this project. "
                    "Enable it at https://console.cloud.google.com/apis/"
                    "library/sheets.googleapis.com then retry."
                ))
            else:
                email = sa_email or "<service-account email>"
                self.stderr.write(self.style.WARNING(
                    f"Fix: share the spreadsheet with the service account. "
                    f"Open the sheet -> Share -> add {email} as Editor, "
                    f"then retry."
                ))
        elif code == 404 or "NOT_FOUND" in text:
            self.stderr.write(self.style.WARNING(
                f"Fix: no spreadsheet exists with ID '{sheet_id}'. Copy the "
                "ID from the sheet URL between '/d/' and '/edit' into "
                "GOOGLE_SPREADSHEET_ID."
            ))
        elif "invalid_grant" in text or "JWT" in text:
            self.stderr.write(self.style.WARNING(
                "Fix: the service-account key is invalid, expired, or the "
                "system clock is wrong. Create a fresh key in Google Cloud "
                "Console -> IAM -> Service Accounts -> Keys and replace the "
                "JSON file in backend/credentials/."
            ))
