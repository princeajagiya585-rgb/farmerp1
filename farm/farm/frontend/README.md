# FarmERP Pro — Web Admin (React + Tailwind + Vite)

## Setup
```bash
npm install
npm run dev      # http://localhost:5173
```
The dev server proxies `/api` and `/media` to the Django backend at `http://127.0.0.1:8000`
(see `vite.config.js`). Start the backend first.

## Build
```bash
npm run build    # outputs to dist/
npm run preview  # serve the production build
```

## Demo login
`admin` / `Passw0rd!` (also: manager, worker).

## Structure
```
src/
  lib/api.js              axios client + JWT refresh interceptor + REST helpers
  context/AuthContext.jsx auth state, login/logout, role checks
  config/nav.js           sidebar items + role visibility
  components/
    Layout.jsx            sidebar + topbar shell
    ProtectedRoute.jsx    auth + role guard
    CrudResource.jsx      config-driven CRUD page (table + modal form + FK dropdowns)
    ui.jsx                Card, Button, Input, Select, Table, Modal, Badge, StatCard…
  pages/                  Dashboard, Farms, Workforce, Attendance, Payroll, Tasks,
                          Agronomy, Inventory, Documents, Finance, GPS, Reports,
                          Users, AuditLogs, Login, NotFound
```

## Notes
- Pages are role-guarded both in the router (`App.jsx`) and the sidebar (`config/nav.js`).
- Most module pages are thin configs over `CrudResource`; custom logic lives in
  Attendance, Payroll, Finance, GPS, Reports and Dashboard.
- Charts use `recharts`; icons use `lucide-react`.
