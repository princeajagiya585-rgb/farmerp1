# Deploying FarmERP Pro

**Architecture:** Frontend → **Vercel** · Backend (Django API) → **Railway** · Database → **Supabase Postgres** (already set up).

The Django backend uses WebSockets for live GPS tracking + handles file uploads, so it goes on Railway.

---

## 0. Push the code to GitHub (one time)
A repo has been initialized locally. Create an empty GitHub repo, then:
```bash
cd "farm/farm"
git remote add origin https://github.com/<you>/farmerp.git
git branch -M main
git push -u origin main
```

## 1. Backend → Railway
1. Go to https://railway.app → **New Project** → **Deploy from GitHub repo** → connect your repo.
2. Set **Root Directory = `farm/farm/backend`** (where the Dockerfile is).
3. Railway auto-detects the Dockerfile and builds it.
4. In the **Variables** tab, add:
   | Key | Value |
   |---|---|
   | `SECRET_KEY` | a long random string |
   | `DEBUG` | `false` |
   | `ALLOWED_HOSTS` | `farmerp-backend-production.up.railway.app,farmerp1.vercel.app,localhost,127.0.0.1` |
   | `DATABASE_URL` | your Supabase connection string |
   | `CORS_ALLOWED_ORIGINS` | `https://farmerp1.vercel.app,http://localhost:5173,http://localhost:5174,http://localhost:3000` |
   | `CSRF_TRUSTED_ORIGINS` | `https://farmerp1.vercel.app` |
   | `ACCESS_TOKEN_LIFETIME_MIN` | `60` |
   | `REFRESH_TOKEN_LIFETIME_DAYS` | `7` |
   | `LOCATIONIQ_API_KEY` | your LocationIQ key |
   | `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` | your email config |
   | `EMAIL_PORT` | `587` |
   | `EMAIL_USE_TLS` | `True` |
5. Deploy. Once it's live, note the Railway URL, e.g. `https://farmerp-backend-production.up.railway.app`. Check `…/api/docs/` returns 200.
6. **(One-time)** Run migrations and seed demo data via Railway's **Connect** tab → **Shell**:
   ```bash
   python manage.py migrate --noinput
   python manage.py seed_demo
   ```
   These run automatically in the build, but the first deploy may need a manual run if the DB is empty.

## 2. Frontend → Vercel
1. `vercel login` (with **princeajagiya585@gmail.com**), or import the repo at https://vercel.com/new.
2. Set **Root Directory = `frontend`** (Vercel auto-detects Vite + reads `frontend/vercel.json`).
3. Add **Environment Variables** (Production):
   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://farmerp-backend-production.up.railway.app` (no trailing slash) |
   | `VITE_WS_URL` | `wss://farmerp-backend-production.up.railway.app` |
4. Deploy. The `vercel.json` rewrites proxy `/api/*` and `/media/*` to Railway automatically.

## 3. Log in
Use your existing accounts (data is on Supabase). API docs: `https://farmerp-backend-production.up.railway.app/api/docs/`.

---

## ⚠️ Notes
- **File uploads (Aadhaar/attendance photos):** For persistent uploads, set `USE_S3=True` + S3/Supabase-Storage keys (the app already supports `USE_S3`), or add a Railway volume (paid).
- **Free tier sleep:** Railway services may spin down when idle; the first request after idle is slow (cold start).
- **WebSockets** use Channels' in-memory layer (fine for one instance). To scale to multiple instances, add Redis as the channel layer.
- **Security:** rotate the Supabase password that was shared earlier and update `DATABASE_URL`.
