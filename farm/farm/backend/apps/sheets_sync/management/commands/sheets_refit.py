"""
One-time (re-runnable) restructure of the spreadsheet:

    python manage.py sheets_refit

* renames worksheets that still carry raw table names to their
  user-friendly titles (data is preserved — no re-upload),
* deletes every worksheet that does not belong to a synced business
  table (Django system tables, accounts/audit mirrors, default Sheet1),
* applies the standard look to every business worksheet: frozen bold
  green header row, basic filter, auto-sized columns, hidden ID column.

Everything is batched — the whole restructure costs a handful of API
calls regardless of table count.
"""
from django.core.management.base import BaseCommand

from apps.sheets_sync import client, conf, registry


class Command(BaseCommand):
    help = ("Rename business worksheets to friendly titles, delete system-"
            "table worksheets, and apply header formatting.")

    def handle(self, *args, **options):
        if not conf.fully_configured():
            self.stderr.write(self.style.ERROR(
                "Sheets sync is not configured — run `manage.py sheets_check`."))
            raise SystemExit(1)

        sh = client.get_spreadsheet()
        models = list(registry.iter_synced_models())
        desired = {registry.worksheet_title(m): m for m in models}
        legacy = {m._meta.db_table: registry.worksheet_title(m)
                  for m in models}

        worksheets = client.with_retry(sh.worksheets)
        current_titles = {ws.title for ws in worksheets}

        # -- 1. rename legacy table-named sheets (keeps their data) --------
        renames = []
        for ws in worksheets:
            new_title = legacy.get(ws.title)
            if (new_title and new_title != ws.title
                    and new_title not in current_titles):
                renames.append({"updateSheetProperties": {
                    "properties": {"sheetId": ws.id, "title": new_title},
                    "fields": "title",
                }})
                current_titles.add(new_title)
                self.stdout.write(f"  rename: {ws.title} -> {new_title}")
        if renames:
            client.with_retry(sh.batch_update, {"requests": renames})

        # -- 2. delete everything that is not a business worksheet ---------
        worksheets = client.with_retry(sh.worksheets)
        keep = [ws for ws in worksheets if ws.title in desired]
        drop = [ws for ws in worksheets if ws.title not in desired]
        if not keep:
            self.stderr.write(self.style.ERROR(
                "No business worksheet exists yet — run `manage.py "
                "sheets_backfill` first so the spreadsheet is never left "
                "empty."))
            raise SystemExit(1)
        if drop:
            deletes = [{"deleteSheet": {"sheetId": ws.id}} for ws in drop]
            client.with_retry(sh.batch_update, {"requests": deletes})
            for ws in drop:
                self.stdout.write(f"  delete: {ws.title}")

        # -- 3. format every business worksheet in one call ----------------
        fmt = []
        for ws in keep:
            ncols = len(registry.headers(desired[ws.title]))
            fmt.extend(client.format_requests(ws.id, ncols))
        if fmt:
            client.with_retry(sh.batch_update, {"requests": fmt})

        self.stdout.write(self.style.SUCCESS(
            f"Done. {len(renames)} renamed, {len(drop)} deleted, "
            f"{len(keep)} business worksheets formatted."))
        missing = [t for t in desired if t not in {w.title for w in keep}]
        if missing:
            self.stdout.write(
                f"{len(missing)} business worksheet(s) don't exist yet and "
                f"will be created on first write or next backfill: "
                f"{', '.join(sorted(missing)[:10])}"
                f"{' …' if len(missing) > 10 else ''}")
