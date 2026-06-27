# Deploying FarmERP Pro

**Architecture:** Frontend → **Vercel** · Backend (Django API) → **Render** · Database → **Supabase Postgres** (already set up).

The Django backend can't run on Vercel (it uses WebSockets for live GPS + handles file uploads), so it goes on Render.

---

## 0. Push the code to GitHub (one time)
A repo has been initialized locally. Create an empty GitHub repo, then:
```bash
cd "farm/farm"
git remote add origin https://github.com/<you>/farmerp.git
git branch -M main
git push -u origin main
```

## 1. Backend → Render
1. Go to https://render.com → **New ▸ Blueprint** → connect your GitHub repo. Render reads `render.yaml`.
2. It creates the `farmerp-api` web service. In the service's **Environment** tab, set:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | your Supabase string (`postgresql://postgres:…@db.<ref>.supabase.co:5432/postgres`) |
   | `ALLOWED_HOSTS` | `farmerp-api.onrender.com` (your Render host) |
   | `CORS_ALLOWED_ORIGINS` | `https://<your-app>.vercel.app` |
   | `CSRF_TRUSTED_ORIGINS` | `https://<your-app>.vercel.app` |
   (`SECRET_KEY` and `DEBUG=false` are set automatically by the blueprint.)
3. Deploy. Note the URL, e.g. `https://farmerp-api.onrender.com`. Check `…/api/docs/` returns 200.

## 2. Frontend → Vercel
1. `vercel login` (with **princeajagiya585@gmail.com**), or import the repo at https://vercel.com/new.
2. Set **Root Directory = `frontend`** (Vercel auto-detects Vite + reads `frontend/vercel.json`).
3. Add **Environment Variables** (Production):
   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://farmerp-api.onrender.com` (your Render URL, no trailing slash) |
   | `VITE_WS_URL` | `wss://farmerp-api.onrender.com` |
4. Deploy. After the first deploy, copy the Vercel URL and put it into Render's `CORS_ALLOWED_ORIGINS` / `CSRF_TRUSTED_ORIGINS`, then redeploy the backend.

## 3. Log in
Use your existing accounts (data is on Supabase). API docs: `https://farmerp-api.onrender.com/api/docs/`.

---

## ⚠️ Notes
- **File uploads (Aadhaar/attendance photos):** Render's free disk is ephemeral — uploaded photos are lost on redeploy. For persistent uploads, set `USE_S3=True` + S3/Supabase-Storage keys (the app already supports `USE_S3`), or add a Render **persistent disk** (paid).
- **Free tier sleeps:** Render free services spin down when idle; the first request after idle is slow (cold start).
- **WebSockets** use Channels' in-memory layer (fine for one instance). To scale to multiple instances, add Redis as the channel layer.
- **Security:** rotate the Supabase password that was shared earlier and update `DATABASE_URL`.
