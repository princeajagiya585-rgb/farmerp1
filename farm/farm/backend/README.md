# FarmERP Pro — Backend (Django REST Framework)

## Setup

### 1. PostgreSQL
**Windows (installer in `C:\Program Files\PostgreSQL\16`):**
```powershell
# If the service isn't running, start the bundled server:
& "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe" start -D "C:\Program Files\PostgreSQL\16\data"
# Create the database (default user 'postgres'):
$env:PGPASSWORD="postgres"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost -c "CREATE DATABASE farmerp"
```

**macOS/Linux:**
```bash
sudo -u postgres createdb farmerp
# or
psql -U postgres -c "CREATE DATABASE farmerp"
```

### 2. Python environment
```bash
python -m venv venv
# Windows:  venv\Scripts\activate   |  macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
```

### 3. Environment variables
```bash
cp .env.example .env
```
Edit `.env` and set `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`.

### 4. Migrate, seed, run
```bash
python manage.py migrate
python manage.py seed_demo        # optional demo data
python manage.py createsuperuser  # optional, your own admin
python manage.py runserver
```

## URLs
- API root: `http://127.0.0.1:8000/api/v1/`
- Swagger docs: `http://127.0.0.1:8000/api/docs/`
- OpenAPI schema: `http://127.0.0.1:8000/api/schema/`
- Django admin: `http://127.0.0.1:8000/admin/`

## Auth
```http
POST /api/v1/auth/login/      {username, password}  -> {access, refresh, user}
POST /api/v1/auth/refresh/    {refresh}             -> {access, refresh}
POST /api/v1/auth/logout/     {refresh}             (blacklists token)
```
Send `Authorization: Bearer <access>` on every request.

## App structure
```
config/            settings, root urls, wsgi/asgi
apps/
  core/            base models (UUID/timestamps), audit log + middleware, RBAC permissions, base viewset
  accounts/        custom User (role, farms M2M), JWT login, user management
  farms/           Farm, Field + farm-scoping mixin
  workforce/       Employee, Shift, Allocation, Attendance (check_in/out/approve)
  payroll/         PayrollPeriod (generate), Advance, Incentive, Deduction, Payslip, Payment
  tasks/           Task (submit/verify/complete), TaskUpdate
  agronomy/        Crop (history), Plantation, Observation, InputApplication, Growth, Harvest
  inventory/       Item (low_stock/valuation), StockMovement (auto stock adjust)
  documents/       Document, DocumentVersion (file upload)
  finance/         Vendor, Expense/Purchase (approve→ledger), LedgerEntry, Payment, Revenue
  gps/             Geofence, LocationPing (live), FieldActivity (verify)
  notifications/   Notification + notify() service
  reporting/       dashboard + report APIViews, audit-log viewset
```

## Key custom endpoints
- `POST /workforce/attendance/check_in/` · `.../{id}/check_out/` · `.../{id}/approve/`
- `POST /payroll/periods/{id}/generate/` — builds payslips from approved attendance
- `POST /tasks/{id}/submit|verify|complete/`
- `GET  /inventory/items/low_stock/` · `/valuation/`
- `GET  /agronomy/crops/{id}/history/`
- `GET  /gps/pings/live/` · `POST /gps/activities/{id}/verify/`
- `GET  /reporting/dashboard/` and `/reporting/{finance,inventory,crops,attendance}/`

## Notes
- RBAC: `apps/core/permissions.py` (RoleAllowed) + `FarmScopedQuerysetMixin` enforce role + farm scoping.
- Audit: `apps/core/middleware.py` records every authenticated write.
- S3 storage: set `USE_S3=True` and AWS keys in `.env`.
