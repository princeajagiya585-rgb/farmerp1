"""
Django settings for FarmERP Pro.
"""
from datetime import timedelta
from pathlib import Path
import os

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(key, default=False):
    return os.getenv(key, str(default)).lower() in ("1", "true", "yes", "on")


def env_list(key, default=""):
    raw = os.getenv(key, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


SECRET_KEY = os.getenv("SECRET_KEY")

if not SECRET_KEY:
    raise Exception("SECRET_KEY environment variable is not set")
DEBUG = env_bool("DEBUG", False)
ALLOWED_HOSTS = env_list(
    "ALLOWED_HOSTS",
    "localhost,127.0.0.1,.up.railway.app,.railway.app,.vercel.app,farmerp-frontend.vercel.app"
)
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

# ---------------------------------------------------------------------------
# Applications
# ---------------------------------------------------------------------------
DJANGO_APPS = [
    # `daphne` must come first so its ASGI `runserver` (with WebSocket support)
    # overrides Django's default WSGI dev server.
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "channels",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
]

LOCAL_APPS = [
    "apps.accounts",
    "apps.core",
    "apps.farms",
    "apps.workforce",
    "apps.payroll",
    "apps.tasks",
    "apps.agronomy",
    "apps.inventory",
    "apps.documents",
    "apps.finance",
    "apps.gps",
    "apps.notifications",
    "apps.reporting",
    "apps.breakdowns",
    "apps.assets",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",  # serve static files in production
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "config.middleware.CsrfExemptApiMiddleware",  # exempt /api/ from CSRF (JWT-only auth)
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.core.middleware.AuditTrailMiddleware",
]

ROOT_URLCONF = "config.urls"

APPEND_SLASH = True  # Prevent 404s on requests without trailing slashes

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# ---------------------------------------------------------------------------
# Channels — in-memory layer (switch to Redis in production)
# ---------------------------------------------------------------------------
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    },
}

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
import urllib.parse as _urlparse

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if DATABASE_URL:
    # Postgres (e.g. Supabase). Credentials live only in .env, never in code.
    _u = _urlparse.urlparse(DATABASE_URL)
    _host = _u.hostname or ""
    _user = _urlparse.unquote(_u.username or "")
    _port = str(_u.port or 5432)

    # ── Supabase pooler tenant fix ──────────────────────────────────────
    # Supabase's connection poolers (…pooler.supabase.com) route by a *tenant*
    # username of the form ``postgres.<project-ref>``.  A bare ``postgres``
    # user makes the pooler reject every connection with
    # ``FATAL: no tenant identifier provided`` (surfaces as OperationalError,
    # i.e. a 500 on every request).  If the URL points at a pooler but the
    # username is missing the ``.<ref>`` suffix, derive the ref from
    # SUPABASE_URL and repair it automatically.
    _is_pooler = "pooler.supabase.com" in _host
    if _is_pooler and _user == "postgres":
        _ref = _urlparse.urlparse(os.getenv("SUPABASE_URL", "")).hostname or ""
        _ref = _ref.split(".")[0]  # <ref>.supabase.co -> <ref>
        if _ref:
            _user = f"postgres.{_ref}"

    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": (_u.path or "/postgres").lstrip("/") or "postgres",
            "USER": _user,
            "PASSWORD": _urlparse.unquote(_u.password or ""),
            "HOST": _host,
            "PORT": _port,
            # ── Connection lifetime ─────────────────────────────────────
            # Behind a pooler (esp. the transaction pooler on :6543) the pool
            # itself does the connection reuse, so Django must NOT hold its own
            # persistent connections — doing so exhausts the pooler's session
            # slots (``max clients reached``) and hands back sockets the pooler
            # has already recycled (``server closed the connection``). Use a
            # fresh connection per request when pooled; keep persistence for a
            # direct Postgres connection.
            "CONN_MAX_AGE": 0 if _is_pooler else 300,
            "CONN_HEALTH_CHECKS": True,
            # The transaction pooler multiplexes server connections per
            # transaction, so named server-side cursors (used by .iterator())
            # can't span the round-trip — disable them.
            "DISABLE_SERVER_SIDE_CURSORS": _is_pooler,
            "OPTIONS": {
                "sslmode": os.getenv("DB_SSLMODE", "require"),
                # Connection timeout for Supabase (free tier can be slow to wake)
                "connect_timeout": 30,
                # psycopg3 prepares statements by default; the transaction
                # pooler routes each transaction to a different backend, so a
                # prepared statement created on one is missing on the next.
                # None disables client-side prepared statements entirely.
                "prepare_threshold": None,
                # Keepalive to prevent Supabase from killing idle connections
                "keepalives": 1,
                "keepalives_idle": 60,
                "keepalives_interval": 15,
                "keepalives_count": 5,
            },
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ---------------------------------------------------------------------------
# DRF / JWT
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        # Rejects deactivated/suspended users on EVERY request (stock
        # JWTAuthentication only checks signature/expiry, so a suspended
        # user could keep using their token for up to 24h).
        "apps.core.auth.ActiveJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
        "apps.core.filters.DateRangeFilterBackend",
        "apps.core.filters.UserFilterBackend",
    ),
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardPagination",
    "PAGE_SIZE": 25,
    "EXCEPTION_HANDLER": "apps.core.exceptions.exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",

    # ── Throttling ────────────────────────────────────────────────────────
    # Only public (AllowAny) endpoints are throttled — the OTP send/verify
    # endpoints are the only public entry points and need rate limiting to
    # prevent brute-force and enumeration attacks.  All other endpoints are
    # protected by JWT auth and are NOT throttled.
    "DEFAULT_THROTTLE_RATES": {
        "otp_send": "5/minute",      # 5 OTP requests per phone/email per minute
        "otp_verify": "10/minute",   # 10 verify attempts per phone/email per minute
    },
}

from datetime import timedelta

SIMPLE_JWT = {
    # Users पूरे दिन काम कर सकें
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=24),

    # 30 दिन तक Refresh Token valid
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),

    # हर refresh पर नया refresh token जारी होगा
    "ROTATE_REFRESH_TOKENS": True,

    # पुराने refresh token blacklist हो जाएंगे
    "BLACKLIST_AFTER_ROTATION": True,

    "UPDATE_LAST_LOGIN": True,

    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,

    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_HEADER_NAME": "HTTP_AUTHORIZATION",

    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",

    # बेहतर clock tolerance
    "LEEWAY": 30,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "FarmERP Pro API",
    "DESCRIPTION": "Enterprise Farm ERP platform for agricultural and plantation management.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "ENUM_NAME_OVERRIDES": {
        "StatusEnum": "apps.agronomy.models.Crop.Status",
        "ApprovalStatusEnum": "apps.workforce.models.Attendance.ApprovalStatus",
        "CategoryEnum": "apps.workforce.models.Employee.Category",
    },
}

# ---------------------------------------------------------------------------
# LocationIQ Reverse Geocoding
# ---------------------------------------------------------------------------
LOCATIONIQ_API_KEY = os.getenv("LOCATIONIQ_API_KEY", "")

# ---------------------------------------------------------------------------
# CORS — Cross-Origin Resource Sharing
# ---------------------------------------------------------------------------
# IMPORTANT: The CORS_ALLOWED_ORIGINS env var APPENDS to the defaults below.
# It does NOT replace them. This prevents accidentally blocking your frontend
# when you add a new URL to the env var.
#
# To add more origins without removing the defaults, set:
#   CORS_ALLOWED_ORIGINS = https://your-custom-domain.com,https://another-domain.com
#
# The default list already includes the production and development URLs.
_CORS_DEFAULTS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "https://farmerp1.vercel.app",
    "https://farmerp-frontend.vercel.app",
]

# Merge env var origins with defaults (no accidental overrides)
_env_origins = env_list("CORS_ALLOWED_ORIGINS", "")
CORS_ALLOWED_ORIGINS = list(set(_CORS_DEFAULTS + _env_origins))

# CORS_ALLOWED_ORIGINS does NOT support wildcards, so use regex for any
# Vercel/Railway deployment that the CORS env var hasn't explicitly listed.
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https://.+vercel\.app$",
    r"^https://.+railway\.app$",
    r"^https://.+netlify\.app$",
]
CORS_ALLOW_CREDENTIALS = True

# Required by Django for cross-origin POST (e.g. the admin) behind HTTPS.
# Note: CSRF_TRUSTED_ORIGINS does NOT support wildcards either.
# Add your exact frontend URL in the Railway dashboard env var.
_CSRF_DEFAULTS = [
    "https://farmerp1.vercel.app",
    "https://farmerp-frontend.vercel.app",
]
_env_csrf = env_list("CSRF_TRUSTED_ORIGINS", "")
CSRF_TRUSTED_ORIGINS = list(set(_CSRF_DEFAULTS + _env_csrf))

# Behind Railway/Vercel's HTTPS proxy, trust the forwarded scheme header.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True

# ── Production Security Settings ──────────────────────────────────────────
# These are safe on Railway/Vercel because they terminate SSL at the edge.
# Enable HSTS only if the entire site is HTTPS (it is on Railway/Vercel).
SECURE_HSTS_SECONDS = 31536000  # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_SSL_REDIRECT = not DEBUG  # Redirect HTTP → HTTPS in production
SESSION_COOKIE_SECURE = not DEBUG  # Secure cookie in production
CSRF_COOKIE_SECURE = not DEBUG  # Secure CSRF cookie in production
# Slight performance boost: don't send the cookie on every subrequest
SESSION_COOKIE_HTTPONLY = True
# Prevent clickjacking
X_FRAME_OPTIONS = "DENY"

# ---------------------------------------------------------------------------
# Supabase Storage (replaces local MEDIA_ROOT / S3)
# ---------------------------------------------------------------------------
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
SUPABASE_STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "uploads")

# ---------------------------------------------------------------------------
# I18N
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

LANGUAGES = [
    ("en", "English"),
    ("hi", "Hindi"),
    ("mr", "Marathi"),
    ("ta", "Tamil"),
    ("te", "Telugu"),
]

# ---------------------------------------------------------------------------
# Static / Media
# ---------------------------------------------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
# Compressed, cache-busted static files served by WhiteNoise in production.
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

if env_bool("USE_S3", False):
    AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
    AWS_STORAGE_BUCKET_NAME = os.getenv("AWS_STORAGE_BUCKET_NAME")
    AWS_S3_REGION_NAME = os.getenv("AWS_S3_REGION_NAME")
    STORAGES = {
        "default": {"BACKEND": "storages.backends.s3.S3Storage"},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }
elif SUPABASE_URL and SUPABASE_SERVICE_KEY:
    # Supabase Storage overrides the default file storage when credentials
    # are present.  All ImageField / FileField uploads go to the Supabase
    # Storage bucket instead of the local filesystem.
    STORAGES["default"] = {"BACKEND": "apps.core.storage.SupabaseFileStorage"}
    # MEDIA_URL and MEDIA_ROOT are kept as fallback for backward compatibility.

# ---------------------------------------------------------------------------
# Email (Gmail SMTP)
# ---------------------------------------------------------------------------
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_USE_TLS = True
EMAIL_USE_SSL = False
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", EMAIL_HOST_USER)
EMAIL_TIMEOUT = 15

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
