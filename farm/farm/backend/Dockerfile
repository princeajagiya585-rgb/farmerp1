# ── Stage 1: dependency builder ──────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# System libs required by psycopg (libpq) and Pillow (jpeg/zlib)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    libjpeg-dev \
    zlib1g-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Stage 2: runtime image ────────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Only runtime shared libraries needed (no build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libjpeg62-turbo \
    zlib1g \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy project source (venv2/, media/, db.sqlite3 excluded via .dockerignore)
COPY . .

# Collect static files at build time (WhiteNoise serves them at runtime)
RUN python manage.py collectstatic --noinput

# Persistent volumes for user-uploaded media
VOLUME ["/app/media"]

EXPOSE 8000

# ── Startup ────────────────────────────────────────────────────────────────
# Run migrations + seed demo data, then start Daphne (HTTP + WebSocket).
# Railway sets $PORT automatically; fall back to 8000 for local Docker.
# CMD sh -c "python manage.py migrate --noinput && python manage.py seed_demo --noinput && exec daphne -b 0.0.0.0 -p \${PORT:-8000} config.asgi:application"
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "config.asgi:application"]