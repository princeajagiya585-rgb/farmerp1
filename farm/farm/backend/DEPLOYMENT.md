# Deployment Guide — FarmERP Backend (Railway + Supabase)

## Required Environment Variables

Set these in your **Railway Dashboard** (`farmerp-backend` → Variables):

### Core Django

| Variable | Example Value | Required |
|---|---|---|
| `SECRET_KEY` | `django-insecure-<random-string>` | Yes |
| `DEBUG` | `False` | Yes |
| `ALLOWED_HOSTS` | `farmerp-backend-production.up.railway.app` | Yes |
| `DATABASE_URL` | `postgresql://postgres:...@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres` | Yes |

### Supabase Storage

| Variable | Example Value | Required |
|---|---|---|
| `SUPABASE_URL` | `https://favafuvuglsorwmezggd.supabase.co` | Yes |
| `SUPABASE_SERVICE_KEY` | `eyJhbGciOiJIUzI1NiIs...` (service_role JWT) | Yes |
| `SUPABASE_STORAGE_BUCKET` | `uploads` | No (defaults to `uploads`) |

> **Where to find these in Supabase:**
> Dashboard → Project Settings → API → Project URL + `service_role` key
> (Use the `service_role` key, **NOT** the `anon` public key.)

### CORS

| Variable | Example Value | Required |
|---|---|---|
| `CORS_ALLOWED_ORIGINS` | `https://farmerp1.vercel.app` | Yes |
| `CSRF_TRUSTED_ORIGINS` | `https://farmerp1.vercel.app` | Yes |

### Optional

| Variable | Example | Notes |
|---|---|---|
| `EMAIL_HOST_USER` | `your-email@gmail.com` | For forgot-password OTP emails |
| `EMAIL_HOST_PASSWORD` | Gmail App Password | Enable 2FA, generate app-specific password |
| `LOCATIONIQ_API_KEY` | `<your-key>` | Map reverse geocoding |

## How It Works

When `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set in the environment,
`config/settings.py` automatically switches the default file storage from
Django's local `FileSystemStorage` to `SupabaseFileStorage`:

```python
if SUPABASE_URL and SUPABASE_SERVICE_KEY:
    STORAGES["default"] = {"BACKEND": "apps.core.storage.SupabaseFileStorage"}
```

All existing `ImageField` and `FileField` model fields transparently use
Supabase Storage — **no model or serializer changes needed**. Files are
uploaded to the `uploads` bucket under a `prefix/YYYY/MM/DD/uuid.ext` path
and served via the Supabase CDN.

## Post-Deployment Steps

After your first deployment with Supabase Storage configured:

```bash
# 1. Verify bucket exists and uploads work (auto-created on startup)
python manage.py setup_supabase_storage

# 2. Migrate existing files from Railway's local disk to Supabase
#    Run this ONCE after deployment:
python manage.py migrate_to_supabase

#    Preview what would be migrated (safe to run anytime):
python manage.py migrate_to_supabase --dry-run
```

## Local Development

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

For local development without Supabase Storage (files go to `media/`),
leave `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` empty in `.env`.

## Architecture

```
User uploads photo → ImageField/FileField
    → Django's DEFAULT_FILE_STORAGE
        → SupabaseFileStorage._save()
            → supabase-py upload to bucket "uploads"
            → Path: uploads/avatars/2025/04/07/<uuid>.jpg
        → SupabaseFileStorage.url()
            → Returns CDN URL:
              https://<project>.supabase.co/storage/v1/object/public/uploads/...
    → Serializer: build_absolute_photo_url()
        → photo.url already returns absolute CDN URL → returned as-is
    → Frontend: normalizePhotoUrl() / PhotoThumb component
        → Handles absolute URLs, lazy loading, broken-image fallback
```
