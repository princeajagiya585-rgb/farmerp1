# Google Sheets Mirror

Supabase (Postgres) stays the **primary database**. This app mirrors every
committed write of the **business tables** (farms, workforce, payroll,
tasks, finance, …; Django system tables are never mirrored) into your
existing Google Spreadsheet — one worksheet per table, named after the
model ("Employees", "Revenue Entries", …) with a frozen green header,
filters, auto-sized columns and a hidden ID column. The spreadsheet is
**never created by the app**; it must already exist and is pinned by
`GOOGLE_SPREADSHEET_ID`.

Full architecture and testing guide: `backend/GOOGLE_SHEETS_SYNC.md`.

## How it works

1. A record is saved through Django ORM → committed to **Supabase first**.
2. `transaction.on_commit` enqueues the record to a background worker —
   the sync can never block or roll back the database write.
3. The worker upserts the row into the table's worksheet (column A = primary
   key). Deletes remove the row. Sheets/quota errors are retried with
   backoff and logged; Supabase is never affected.
4. Worksheets (tabs) inside the pinned spreadsheet are created on demand,
   one per table, with a header row that follows schema changes.

Sessions, JWT blacklist, admin log, permissions, and secret columns
(`password`, `fcm_token`) are never mirrored (`registry.py`).

## One-time setup

1. In [Google Cloud Console](https://console.cloud.google.com) create a
   project → enable **Google Sheets API** and **Google Drive API**.
2. Create a **Service Account** (IAM & Admin → Service Accounts) → Keys →
   Add key → JSON. Download the key file.
3. Provide the credentials:
   - **Locally:** drop the JSON key into `backend/credentials/` — it is
     auto-detected and the folder is git-ignored, so the key never reaches
     the repository. (Or set `GOOGLE_SERVICE_ACCOUNT_FILE` explicitly.)
   - **Production (Railway):** set `GOOGLE_SERVICE_ACCOUNT_JSON` to the
     whole JSON key on one line.
4. Open your spreadsheet → **Share** → add the service account's
   `client_email` (from the JSON key) as **Editor**.
5. Set `GOOGLE_SPREADSHEET_ID` to the ID from the sheet URL
   (`docs.google.com/spreadsheets/d/<ID>/edit`).
6. Verify the connection:

   ```
   python manage.py sheets_check
   ```

   Prints `Google Sheets connection successful.` or the exact error with
   the concrete fix.
7. **Migrate existing data before relying on live sync:**

   ```
   python manage.py sheets_backfill
   ```

   Re-runnable any time; it rewrites every worksheet from the current
   database truth (also the fix-up after `bulk_create` / `queryset.update`,
   which bypass Django signals).

After that, live sync runs automatically inside the backend process.
