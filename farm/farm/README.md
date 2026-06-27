# 🌿 FarmERP Pro

An enterprise-grade **Farm ERP platform** for agricultural businesses and plantation management companies. It digitizes workforce, payroll, agronomy, inventory, finance, planning, reporting and administration across multiple farms from one centralized system.

> **Stack:** Django REST Framework + PostgreSQL (backend) · React + Tailwind CSS + Vite (web admin) · React Native / Expo (mobile) · JWT auth with refresh tokens and role-based access.

---

## 📦 Monorepo layout

```
farm/
├── backend/     Django + DRF API, PostgreSQL, JWT, RBAC, audit trail
├── frontend/    React + Tailwind web admin portal (Vite)
├── mobile/      React Native (Expo) field app — GPS attendance, camera, offline
└── README.md    (this file)
```

---

## 🧩 Modules (all 10 implemented)

| # | Module | Highlights |
|---|--------|-----------|
| 1 | **Workforce** | Employee/labour registry, shifts, allocation, GPS+photo attendance, approval workflow |
| 2 | **Payroll** | Daily-wage & salary calc, overtime, incentives, advances, deductions, payslips, payments, auto-generation |
| 3 | **Tasks & Scheduling** | Create/assign/schedule (daily/weekly/monthly), priority, recurrence, progress, submit→verify→complete |
| 4 | **Agronomy & Crops** | Crops, plantation, observations (pest/disease/nutrient/weather), input applications, growth, harvest, history |
| 5 | **Inventory** | Items (fertilizer/pesticide/seed/consumable/spare), stock movements with auto-adjust, reorder alerts, valuation |
| 6 | **Documents** | Secure upload, categories, versioning, search |
| 7 | **Finance** | Vendors, expenses, purchases, approval workflow, ledger posting, payments, revenue |
| 8 | **Reporting & Analytics** | Dashboard KPIs + operational/agronomy/financial reports |
| 9 | **GPS Monitoring** | Location pings, live tracking, geofences, field-activity verification |
| 10 | **RBAC** | 3 roles, farm-scoping, action-level permissions, immutable audit trail |

### Roles
`SUPER_ADMIN` · `FARM_MANAGER` · `EMPLOYEE`

Access is **role-based** *and* **farm-scoped** — non-global users only see data for farms they are assigned to. Every write is recorded in the audit trail.

---

## 🚀 Quick start

### Prerequisites
- **Python 3.12+**, **Node.js 18+**, **PostgreSQL 14+**

### 1. Database
Create the database (see [backend/README.md](backend/README.md) for OS-specific details):
```bash
createdb farmerp        # or: psql -U postgres -c "CREATE DATABASE farmerp"
```

### 2. Backend
```bash
cd backend
python -m venv venv
# Windows:  venv\Scripts\activate     |  macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then edit DB credentials
python manage.py migrate
python manage.py seed_demo    # demo users + sample data
python manage.py runserver    # http://127.0.0.1:8000
```
API docs: **http://127.0.0.1:8000/api/docs/** · Admin: **/admin/**

### 3. Web frontend
```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173  (proxies /api to :8000)
```

### 4. Mobile app
```bash
cd mobile
npm install
npx expo start                # scan QR with Expo Go, or press a / i
```
See [mobile/README.md](mobile/README.md) to point `API_BASE` at your machine.

---

## 🔑 Demo accounts (password `Passw0rd!`)

| Username | Role |
|----------|------|
| `admin` | Super Administrator |
| `manager` | Farm Manager |
| `worker` | Employee / Labour |

---

## 🛠️ System capabilities mapped to requirements

- **Offline-first** — mobile app queues captures in local storage and syncs on demand.
- **Real-time-ish sync** — REST API with token refresh; pull-to-refresh on mobile.
- **GPS** — browser & device geolocation on attendance and activities; geofences per farm.
- **Camera** — photo capture on mobile attendance/field-activity; image upload on web.
- **RBAC** — enforced server-side (permissions + farm scoping) and client-side (route guards, nav filtering).
- **Audit trail** — `AuditTrailMiddleware` logs every authenticated write.
- **Notifications** — `notifications` app + `notify()` helper; FCM token field on user (wire Firebase to push).
- **Multi-farm scalability** — every domain record is farm-scoped; users hold M2M farm assignments.
- **Export PDF/Excel** — report endpoints return structured JSON ready for client-side export.
- **Cloud storage** — set `USE_S3=True` + AWS keys in `.env` to switch media to S3.
- **Multi-language** — Django i18n configured for en/hi/mr/ta/te; user `preferred_language`.

---

## 📐 Architecture notes
- JWT access + rotating refresh tokens (`djangorestframework-simplejwt`) with blacklist on logout.
- Generic, config-driven CRUD UI (`CrudResource`) keeps the web admin DRY across modules.
- Each Django app is self-contained (models / serializers / views / urls / admin) and registered in `config/settings.py`.

See module-specific READMEs in each subfolder.
