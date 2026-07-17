# Google Sheets Live Mirror — How It Works

Supabase (Postgres) is the **primary database**. Google Sheets is a
**read-only live mirror** of it: one worksheet per **business table**,
with a user-friendly name (`workforce_employee` → **Employees**,
`finance_revenueentry` → **Revenue Entries**). Django system tables
(`auth_*`, `django_*`, accounts/users, sessions, permissions, audit log)
are never mirrored. Nothing in the application ever reads from the
spreadsheet, and a Sheets outage can never block or roll back a database
write.

Spreadsheet: `farm_erp` — https://docs.google.com/spreadsheets/d/1QWz4xsGcKB37Am51UNohOm7_ZiWJ7yrdi264j3IGG0Q

---

## 1. How synchronization works

### Write path (live sync)

```
API request
   │
   ▼
Django ORM save()/delete()          ← unchanged, no API/DB logic modified
   │
   ▼
Supabase Postgres COMMIT            ← primary database, always first
   │
   ▼  transaction.on_commit
Background queue (daemon thread)    ← request returns immediately
   │
   ▼
Google Sheets API (gspread)
   upsert / delete ONE row          ← only the changed record
```

- **INSERT** → the record's row is appended to its table's worksheet.
- **UPDATE** → the existing row is found by primary key (column A) and
  updated in place.
- **DELETE** → the row with that primary key is removed.
- **M2M changes** → the through-table worksheet is refreshed.

Only the changed record is written — the sheet is never rewritten on
normal operation. API responses never wait on Sheets: jobs run on a
background daemon thread after the database commit.

**Batching** — each worker cycle drains everything queued (up to 40
jobs), groups the jobs per table, and executes them with batched API
calls: one read + one `values.batchUpdate` + one `values.append` for any
number of upserts of a table, and a single `deleteDimension` batch for
any number of deletes. Rapid consecutive saves of the same record are
additionally coalesced so only the latest state is written. Duplicates
are impossible: an existing primary key is always updated in place, and
same-pk rows within a batch are deduplicated before writing.

**Retry** — quota (429) and transient (5xx) errors retry inside each API
call with exponential backoff (2s → 60s). If the batch still fails (e.g.
Sheets fully unreachable), every affected job is re-queued with
job-level exponential backoff: 5s, 10s, 20s … capped at 5 minutes, up to
8 attempts, after which the operation is marked FAILED in the sync log
(and can be replayed from the dashboard's **Sync Now** button).

**Sync log** — every operation outcome is persisted to the
`sheets_sync_synclog` table: table name, record id, operation
(INSERT/UPDATE/DELETE/REFRESH/BACKFILL), timestamp, status
(SUCCESS/RETRYING/FAILED), attempt count, and the error message when
failed. Entries older than 30 days are pruned automatically. The log
table itself is excluded from mirroring (it would recurse forever).

### Table discovery — business tables only, zero configuration

A table is mirrored when its model belongs to one of this project's
`apps.*` business modules (farms, workforce, payroll, tasks, agronomy,
inventory, finance, gps, notifications, documents, breakdowns, assets,
…), including their auto-created M2M through tables. Detection is
structural, so **any future business module joins the sync
automatically**: signals attach at the next startup and the worksheet is
created in the existing spreadsheet on its first synced write (or next
backfill). New columns extend the header row automatically as well.

Never mirrored: Django/third-party system tables (`auth_*`, `django_*`,
sessions, admin log, content types, permissions, migrations, JWT
blacklist) — these fail the structural test — plus the infrastructure
apps `accounts` (users/OTP), `core` (audit log), and `sheets_sync`
itself (see `registry.EXCLUDED_APP_LABELS`).

### Worksheet naming & look

Worksheets carry user-friendly titles derived from each model's plural
name — `workforce_employee` → **Employees**, `gps_locationping` →
**Location Pings**. Name clashes are disambiguated with the module name
(`payroll_payment` → **Payroll Payments**, `finance_payment` →
**Finance Payments**). Every business worksheet gets a standard look,
applied on creation and on every backfill:

- header row **frozen** and **bold, white on green**,
- a **basic filter** across all columns,
- **auto-resized** column widths,
- the ID column (column A) **hidden** — it stays the sync's upsert/
  delete key but is invisible to readers.

Run `python manage.py sheets_refit` after changing naming or exclusion
rules: it renames legacy worksheets in place (no data re-upload),
deletes worksheets that no longer belong, and re-applies formatting —
all batched into a handful of API calls.

Excluded for security/noise: `django_session`, JWT `token_blacklist`
tables, `django_admin_log`, `django_content_type`, `auth_permission`.
The `password` and `fcm_token` columns are stripped from every table.

### Images and files

Files stay in **Supabase Storage** (public `uploads` bucket). The
spreadsheet stores only the **public CDN URL** in the field's column.
Every `ImageField` additionally gets a `<column>_preview` column
containing `=IMAGE(url)`, so the picture renders inline in the sheet.

### Reliability

- **Ordering guarantee**: sync jobs are created by
  `transaction.on_commit` — they exist only after Postgres durably
  committed. A rolled-back transaction never syncs.
- **Retries**: every Sheets API call retries on quota (429) and
  transient (5xx) errors with exponential backoff (2s → 60s, 5 attempts).
- **Isolation**: a permanently failing job is logged
  (`[SheetsSync] Job failed permanently`) and dropped; the database and
  the API response are unaffected.
- **Security**: all data cells are written as literal text (apostrophe-
  escaped `USER_ENTERED`), so user input like `=HYPERLINK(...)` can never
  execute as a formula. Only the sync's own `=IMAGE(...)` previews are
  evaluated. Credentials load from the git-ignored `credentials/` folder
  locally, or `GOOGLE_SERVICE_ACCOUNT_JSON` in production. The app never
  creates spreadsheets — it only writes to the one pinned by
  `GOOGLE_SPREADSHEET_ID`.

### Known limits

- `bulk_create` / `queryset.update()` / raw SQL bypass Django signals
  (Django by design). Run `python manage.py sheets_backfill` afterwards
  to true up — it rewrites worksheets from database truth and is safe to
  re-run any time.
- Writes done directly in the Supabase dashboard (not through Django)
  are not mirrored until the next backfill.
- Sheets quota is ~60 writes/min; bursts beyond that are absorbed by the
  retry/backoff and the queue.

---

## 2. Files added or modified

| File | Status | Purpose |
|------|--------|---------|
| `apps/sheets_sync/client.py` | modified | gspread wrapper: auth, open pinned spreadsheet (never creates one), worksheet get-or-create, **batched** upserts/deletes, retry/backoff, formula-injection escaping |
| `apps/sheets_sync/registry.py` | modified | Auto-detects synced tables; serializes records (IDs/timestamps preserved as ISO strings, files → public URLs, images → `=IMAGE` preview column) |
| `apps/sheets_sync/conf.py` | modified | Reads `GOOGLE_SPREADSHEET_ID` + credential settings |
| `apps/sheets_sync/signals.py` | existing | `post_save` / `post_delete` / `m2m_changed` → on-commit enqueue |
| `apps/sheets_sync/worker.py` | rewritten | Background daemon-thread queue: batch draining, per-table grouping, job-level retry with exponential backoff, SyncLog audit writes, log pruning |
| `apps/sheets_sync/models.py` | added | `SyncLog` — persistent audit trail of every sync operation |
| `apps/sheets_sync/migrations/0001_initial.py` | added | Creates the `sheets_sync_synclog` table |
| `apps/sheets_sync/admin.py` | added | Read-only SyncLog admin + superuser-only Sync Dashboard with **Sync Now** and **Rebuild all Google Sheets** actions |
| `apps/sheets_sync/templates/admin/sheets_sync/…` | added | Dashboard + changelist templates |
| `apps/sheets_sync/apps.py` | existing | Connects signals at startup when sync is configured |
| `apps/sheets_sync/management/commands/sheets_check.py` | added | Connection test: prints "Google Sheets connection successful." or the exact error + fix |
| `apps/sheets_sync/management/commands/sheets_backfill.py` | modified | One-time (re-runnable) migration of all existing rows; logs per-table BACKFILL outcomes, continues past single-table failures |
| `apps/sheets_sync/management/commands/sheets_refit.py` | added | Restructure: rename worksheets to friendly titles, delete non-business worksheets, apply header formatting |
| `config/settings.py` | modified | `GOOGLE_SPREADSHEET_ID` env var; auto-discovers the service-account key in `backend/credentials/` |
| `.env` / `.env.example` | modified | New variable names + setup instructions |
| `.gitignore` (backend) | modified | `credentials/`, `*.pem`, `*.p12` — the key can never be committed |

No existing API, serializer, view, or model was changed — the mirror
attaches purely via Django signals.

## Admin dashboard

**Django Admin → Google Sheets Sync → Sync log entries → Sync Dashboard**
(`/admin/sheets_sync/synclog/dashboard/`), superusers only (staff
without superuser get 403; anonymous users are sent to the admin login).

It shows: Google connection status (cached probe, 60s), live-sync/worker
state, last successful sync time, pending queue depth, total successful
operations, failed counts (24h / all-time), and the 25 most recent log
entries. Two actions:

- **Sync Now** — re-enqueues every operation that FAILED in the last
  7 days through the normal worker.
- **Rebuild all Google Sheets** — runs the full backfill in a background
  thread (confirmation prompt; blocked while one is already running).

The sync log changelist offers filtering by status/operation/table and
full-text search over errors.

## 3. Configuration

| Variable | Where | Meaning |
|----------|-------|---------|
| `GOOGLE_SPREADSHEET_ID` | `.env` / Railway | ID of your existing spreadsheet (from its URL). Required — the app never creates one. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Railway | Whole service-account JSON key on one line (production) |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | optional | Explicit path to the key file; locally auto-detected from `backend/credentials/*.json` |
| `GOOGLE_SHEETS_SYNC_ENABLED` | both | Master switch (default `True`) |

The spreadsheet must be **shared with the service account** (from the
JSON key: `farm-erp-service@farm-erp-ea3b8.iam.gserviceaccount.com`) as
**Editor**.

### Enabling in production (Railway)

The local run mirrors the local database. Production mirrors the real
Supabase data once you:

1. Set `GOOGLE_SERVICE_ACCOUNT_JSON` (one-line JSON) and
   `GOOGLE_SPREADSHEET_ID` in the Railway dashboard.
2. Rebuild + push the `princeajagiya/farmerp-backend` Docker image
   (Railway deploys from Docker Hub, not from git).
3. Apply the new migration there: `python manage.py migrate sheets_sync`
   (creates the `sheets_sync_synclog` audit table in Supabase).
4. Run once on Railway: `python manage.py sheets_backfill`
   (one-off command / shell) to migrate the existing Supabase rows,
   then `python manage.py sheets_refit` to clean up any leftover
   worksheets and apply formatting.

## 4. How to test the synchronization

```bash
cd backend

# 1. Connection test — must print "Google Sheets connection successful."
python manage.py sheets_check

# 2. One-time migration (re-runnable; rewrites sheets from DB truth)
python manage.py sheets_backfill

# 3. Live sync — INSERT / UPDATE / DELETE through the ORM or the API:
python manage.py shell
```

```python
from apps.farms.models import Farm
from apps.sheets_sync import worker

farm = Farm.objects.first()
farm.name = farm.name  # any save triggers an upsert
farm.save()
worker.wait_until_drained()   # only needed in the shell; requests don't wait
# → open the 'Farms' worksheet: the row is updated in place
```

Or simply use the app/frontend normally: create a task, mark attendance,
upload a photo — within a few seconds the corresponding worksheet gains
or updates exactly that one row (photos appear as URL + inline preview).

Watch the logs for `[SheetsSync]` entries to observe queueing, retries,
and failures.
