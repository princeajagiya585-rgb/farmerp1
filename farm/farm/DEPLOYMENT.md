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
2. Set **Root Directory = `farm/backend`** (where the Dockerfile is).
3. Railway auto-detects the Dockerfile and builds it.
4. In the **Variables** tab, add these **required** variables:

   | Key | Value |
   |---|---|
   | `SECRET_KEY` | a long random string (generate via `openssl rand -hex 32`) |
   | `DEBUG` | `false` |
   | `DATABASE_URL` | your Supabase connection string (postgres://...) |
   | `CORS_ALLOWED_ORIGINS` | `https://<your-vercel-domain>.vercel.app,http://localhost:5173,http://localhost:5174,http://localhost:3000` |
   | `CSRF_TRUSTED_ORIGINS` | `https://<your-vercel-domain>.vercel.app` |

5. **After deployment**, note your Railway URL (e.g. `https://your-app.up.railway.app`). Set these additional variables:

   | Key | Value |
   |---|---|
   | `ALLOWED_HOSTS` | `<your-railway-url>,<your-vercel-domain>.vercel.app,localhost,127.0.0.1` |
   | `BACKEND_URL` | `https://<your-railway-url>` |
   | `ACCESS_TOKEN_LIFETIME_MIN` | `60` |
   | `REFRESH_TOKEN_LIFETIME_DAYS` | `7` |
   | `LOCATIONIQ_API_KEY` | your LocationIQ key (optional) |
   | `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` | your email config (optional) |
   | `EMAIL_PORT` | `587` |
   | `EMAIL_USE_TLS` | `True` |

6. Check the API docs are live: `https://<your-railway-url>/api/docs/` should return the Swagger UI.

7. **(One-time)** Migrations and demo data seed run automatically on startup. If the DB is empty, run manually via Railway **Connect** tab → **Shell**:
   ```bash
   python manage.py migrate --noinput
   python manage.py seed_demo
   ```

## 2. Update Frontend Vercel Config
1. Edit `frontend/vercel.json` — replace `FARMBACKEND_URL_REPLACE_ME` with your actual Railway URL.
2. In the Vercel dashboard (**Settings → Environment Variables**), add these **Production** variables:

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://<your-railway-url>` (no trailing slash) |
   | `VITE_WS_URL` | `wss://<your-railway-url>` |
   | `VITE_SUPABASE_URL` | your Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | your Supabase anon/public key |

3. Deploy the frontend. Vercel will rebuild the app with the env vars baked in.

## 3. Log in
Use your existing accounts (data is on Supabase).

---

## ⚠️ Notes
- **File uploads (Aadhaar/attendance photos):** For persistent uploads, set `USE_S3=True` + S3/Supabase-Storage keys (the app already supports `USE_S3`), or add a Railway volume (paid).
- **Free tier sleep:** Railway services may spin down when idle; the first request after idle is slow (cold start).
- **WebSockets** use Channels' in-memory layer (fine for one instance). To scale to multiple instances, add Redis as the channel layer.
- **Security:** rotate the Supabase password and update `DATABASE_URL`.
