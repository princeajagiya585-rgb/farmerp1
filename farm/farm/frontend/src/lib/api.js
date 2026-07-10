import axios from "axios";

// ── API Base URL ────────────────────────────────────────────────────────
//  🚨 CRITICAL: In production (Vercel), DO NOT set VITE_API_URL in Vercel env vars.
//     When VITE_API_URL is blank/empty, API_BASE = "/api/v1" which means ALL
//     API requests go to the SAME origin (farmerp1.vercel.app). Vercel then
//     PROXIES them to Railway via vercel.json rewrites — NO CORS needed.
//
//  ❌ If VITE_API_URL is set to "https://farmerp-backend-production.up.railway.app",
//     the browser makes DIRECT cross-origin requests to Railway, which triggers
//     the CORS errors you're seeing. The CORS headers on Railway must then match
//     perfectly, which is fragile and often breaks.
//
//  ✅ SOLUTION: Keep VITE_API_URL unset (blank) in Vercel → use same-origin proxy.
//     Only set VITE_API_URL if you need to bypass the proxy for debugging.
//
//  Development: leave blank → Vite proxy forwards /api to localhost:8000.
const API_ORIGIN = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const API_BASE = `${API_ORIGIN}/api/v1`;

// Warn if VITE_API_URL is explicitly set — the user might not realize they are
// bypassing the Vercel proxy and hitting CORS issues.
if (import.meta.env.PROD && import.meta.env.VITE_API_URL) {
  console.warn(
    "[API] VITE_API_URL is set to:", import.meta.env.VITE_API_URL,
    "— the app will make direct cross-origin requests to Railway. ",
    "If you see CORS errors, unset VITE_API_URL in your Vercel env vars ",
    "to use the same-origin Vercel proxy instead."
  );
}

export const api = axios.create({ baseURL: API_BASE });

// ── Photo/Media URL Normalizer ────────────────────────────────────────
// Converts various URL formats to absolute URLs for rendering <img> tags.
//
// In production with Supabase Storage, URLs are already absolute Supabase
// CDN URLs (https://<project>.supabase.co/storage/v1/object/public/...).
// In development, relative URLs are proxied through Vite to Django.
// In production with local storage, relative URLs are proxied through Vercel.
//
// This function simply passes through absolute URLs, handles relative URLs
// for the proxy, and returns null for empty/invalid inputs.
export function normalizePhotoUrl(url) {
  if (!url) return null;
  // Already absolute URL (http/https) - return as-is
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  // Relative URL - ensure it starts with /media/ for Vercel proxy
  if (url.startsWith("/media/")) {
    return url;
  }
  // Handle other relative paths (e.g., /uploads/...)
  return url;
}

// ── Image URL with fallback ─────────────────────────────────────────────
// Returns a safe image URL or null for fallback rendering.
export function safeImageUrl(url) {
  return normalizePhotoUrl(url);
}

export const tokenStore = {
  get access() {
    return localStorage.getItem("access");
  },
  get refresh() {
    return localStorage.getItem("refresh");
  },
  set({ access, refresh }) {
    if (access) localStorage.setItem("access", access);
    if (refresh) localStorage.setItem("refresh", refresh);
  },
  clear() {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
  },
};

// ── Request concurrency limiter ────────────────────────────────────
// Many pages fire 5-8 API calls simultaneously on mount (e.g. GPS.jsx).
// In Railway this burst can trigger rate limits. We limit concurrent
// requests and queue the rest to smooth out the load.
let inFlight = 0;
const requestQueue = [];
const MAX_CONCURRENCY = 6; // Increased from 3 for better UX without overwhelming

function processQueue() {
  while (inFlight < MAX_CONCURRENCY && requestQueue.length > 0) {
    const next = requestQueue.shift();
    inFlight++;
    next()
      .finally(() => {
        inFlight--;
        processQueue();
      });
  }
}

function enqueueRequest(requestFn) {
  return new Promise((resolve, reject) => {
    requestQueue.push(() =>
      requestFn().then(resolve, reject)
    );
    processQueue();
  });
}

const originalRequest = api.request.bind(api);
api.request = function (config) {
  const doRequest = async () => {
    // If a 429 triggered a global cooldown, wait before sending ANY request.
    if (isInGlobalCooldown()) {
      const wait = globalCooldownUntil - Date.now();
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
    return originalRequest(config);
  };
  return enqueueRequest(doRequest);
};

// ── Request Interceptor: Attach Authorization header & proactive refresh ──
// This runs INSIDE originalRequest, AFTER Axios has merged config with
// defaults. The entire body is wrapped in try/catch so that even if
// `refreshAccessToken`, `isTokenExpired`, or `tokenStore.access` throws
// an unexpected error, we STILL return `config` and let the request
// proceed (Axios interceptor chain MUST receive the config object back;
// a rejected promise would short-circuit the chain and no HTTP request
// would be dispatched).
api.interceptors.request.use(async (config) => {
  // ── Log every outgoing request URL (dev only — keeps prod console clean) ──
  if (import.meta.env.DEV) {
    const base = config.baseURL || api.defaults.baseURL || "";
    console.log("[API] REQUEST:", config.method?.toUpperCase(), `${base}${config.url}`, config.params || "");
  }

  try {
    // ── Proactive token refresh ───────────────────────────────────
    const currentAccess = tokenStore.access;
    if (currentAccess && isTokenExpired(currentAccess) && tokenStore.refresh) {
      try {
        await refreshAccessToken();
      } catch {
        // Refresh failed — silently ignored.
        // The API call will proceed with the expired token; if the
        // server returns a 401, the response interceptor will retry.
      }
    }
  } catch (e) {
    // Any unexpected error in the refresh logic must NOT prevent the
    // request from being sent. Log it and continue.
    console.warn("[API] Request interceptor error (non-fatal):", e);
  }

  // ── Attach Authorization header ────────────────────────────────
  // This runs regardless of whether the try block above succeeded or
  // failed. The `|| {}` guard handles the case where Axios helper methods
  // (get/post/patch/delete) build the config without a `headers` property
  // (mergeConfig inside originalRequest hasn't run yet, so config.headers
  // is undefined at this point in the interceptor chain).
  try {
    const token = tokenStore.access;
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (e) {
    console.warn("[API] Failed to attach Authorization header:", e);
  }

  // ALWAYS return config — the Axios interceptor chain requires it.
  // If we throw or return undefined, the HTTP request is never dispatched.
  return config;
});
  
// ── Response Interceptor: Log missing Authorization header ────────────
// When the backend returns 401, log a warning if no Authorization header
// was present — this helps identify auth configuration issues.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && error.config) {
      const hasAuth = !!error.config.headers?.Authorization;
      if (!hasAuth) {
        console.warn(
          "[AUTH] Request to", error.config.url,
          "returned 401 — no Authorization header was attached.",
        );
      }
    }
    // Pass through to the main response interceptor below
    return Promise.reject(error);
  },
);

/**
 * Decode a JWT payload (base64url -> JSON) without a library.
 * Returns null if the token is malformed.
 */
export function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

/**
 * Check whether a JWT access token is expired (or will expire within `bufferSeconds`).
 */
export function isTokenExpired(token, bufferSeconds = 30) {
  const decoded = decodeJwtPayload(token);
  if (!decoded || !decoded.exp) return true;
  return decoded.exp * 1000 <= Date.now() + bufferSeconds * 1000;
}

// ── Token refresh with retry limit ─────────────────────────────────
// Single-flight token refresh: every request that hits a 401 at the same time
// shares ONE refresh call. The promise is only cleared once it has fully
// settled (in `finally`), so a later wave of 401s can never start a second
// refresh with an already-rotated refresh token.
//
// Behavior:
//  - "Token is blacklisted" → immediate terminal failure: tokens + user
//    cleared, a custom event is dispatched so AuthContext can react.
//  - Any other error (network, server error, etc.) → retry ONCE with a 1s
//    delay, then reject WITHOUT clearing user data (so cached UI stays).
//  - Resets retry count on success.
let refreshPromise = null;
let refreshRetries = 0;
const MAX_REFRESH_RETRIES = 1;

export function refreshAccessToken() {
  if (!refreshPromise) {
    const refreshToken = tokenStore.refresh;
    refreshRetries = 0; // reset for a new refresh cycle

    if (!refreshToken) {
      return Promise.reject(new Error("No refresh token available"));
    }

    const doRefresh = () =>
      axios
        .post(`${API_BASE}/auth/refresh/`, { refresh: refreshToken })
        .then(({ data }) => {
          refreshRetries = 0;
          tokenStore.set({ access: data.access, refresh: data.refresh });
          return data.access;
        })
        .catch((err) => {
          const detail = err?.response?.data?.detail || "";
          const code = err?.response?.data?.code || "";
          const isBlacklisted = detail.toLowerCase().includes("blacklisted");
          const isInvalidOrExpired =
            code === "token_not_valid" ||
            detail.toLowerCase().includes("invalid") ||
            detail.toLowerCase().includes("expired");

          if (isBlacklisted || isInvalidOrExpired) {
            // Terminal failure: token was blacklisted (logout/admin), is expired
            // (30+ days of inactivity), or is otherwise invalid.
            // Clear everything and notify AuthContext so it can react.
            console.warn(
              "[AUTH] Token refresh failed —",
              isBlacklisted ? "token blacklisted" : "token expired or invalid",
            );
            tokenStore.clear();
            localStorage.removeItem("user");
            window.dispatchEvent(new CustomEvent("auth:token-blacklisted"));
            throw err;
          }

          if (refreshRetries < MAX_REFRESH_RETRIES) {
            refreshRetries++;
            // Retry once after a short delay
            return new Promise((resolve, reject) => {
              setTimeout(() => doRefresh().then(resolve).catch(reject), 1000);
            });
          }

          // Non-terminal failure after retries — just reject.
          // User stays logged in with cached data until explicit sign-out.
          throw err;
        });

    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// ── 429 Too Many Requests: Global cooldown ──────────────────────────
// When the backend or Railway rate-limits us, retrying the SAME request
// only makes the problem worse (more load → more 429s). Instead we apply
// a global cooldown that pauses ALL outgoing requests for a few seconds.
let globalCooldownUntil = 0;
let globalCooldownTimer = null;

function isInGlobalCooldown() {
  return Date.now() < globalCooldownUntil;
}

function activateGlobalCooldown(retryAfterSeconds = 10) {
  const duration = Math.min(retryAfterSeconds * 1000, 30000); // cap at 30s
  globalCooldownUntil = Date.now() + duration + 1000; // +1s buffer

  // Auto-clear the cooldown after the duration
  if (globalCooldownTimer) clearTimeout(globalCooldownTimer);
  globalCooldownTimer = setTimeout(() => {
    globalCooldownUntil = 0;
    globalCooldownTimer = null;
  }, duration + 1000);
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (!original) return Promise.reject(error);

    // ── 429 Too Many Requests: Global cooldown ────────────────────
    // Don't retry on 429 (that would compound the load). Instead pause
    // ALL requests for a while so the backend / Railway can recover.
    if (error.response?.status === 429) {
      const retryAfter = parseInt(error.response.headers["retry-after"] || "10", 10);
      activateGlobalCooldown(retryAfter);
      return Promise.reject(error);
    }

    // ── Global cooldown check (from a previous 429) ────────────────
    // Check this BEFORE any retry logic so a cooldown pause always takes
    // priority over re-sending requests that would just get rejected again.
    if (isInGlobalCooldown()) {
      const wait = globalCooldownUntil - Date.now();
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }

    // ── 502/503/504 (Bad Gateway / Service Unavailable / Gateway Timeout)
    // These mean Railway is waking up, the backend is restarting, or
    // the DB connection dropped.  Retry ONCE with a 3s delay because
    // Railway free-tier sleeps after inactivity — the first request
    // after a sleep will fail, and a retry usually succeeds.
    const isServerError = [502, 503, 504].includes(error.response?.status);
    if (isServerError && original && !original._retryServer) {
      original._retryServer = true;
      console.warn(`[API] Server error ${error.response.status}, retrying once after 3s...`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return originalRequest(original);
    }

    // ── Network error (no response at all) — Railway wake-up retry ─
    // Axios throws a network error when the backend is unreachable.
    // On Railway free tier this happens when the server is sleeping.
    // Retry ONCE with a 5s delay.
    if (!error.response && !original._retryNetwork) {
      original._retryNetwork = true;
      console.warn("[API] Network error (server may be sleeping), retrying once after 5s...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return originalRequest(original);
    }

    // ── 401 Unauthorized: Try token refresh ────────────────────────
    // Intercept 401, refresh the token, and retry.  This handles both
    // expired access tokens and race conditions where multiple requests
    // all arrive just as the token expires.
    //
    // DO NOT retry auth endpoints (login/refresh) — a 401 there means
    // bad credentials, not an expired token.

    const isAuthEndpoint =
      original?.url?.includes("/auth/login") ||
      original?.url?.includes("/auth/refresh");

    if (error.response?.status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      try {
        const access = await refreshAccessToken();
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${access}`;
        // Use originalRequest directly to bypass the concurrency queue.
        return originalRequest(original);
      } catch (e) {
        // Refresh failed — tokens were already cleared by
        // refreshAccessToken() if it was a terminal failure.
        return Promise.reject(e);
      }
    }

    return Promise.reject(error);
  },
);

// ── Generic REST helpers for a DRF resource (paginated) ────────────
// path is e.g. "auth/users" — no leading slash because API_BASE already
// ends with /api/v1.  DRF endpoints MUST have a trailing slash
// (APPEND_SLASH=True), so we always append one.
function stripLeadingSlash(p) {
  return p.replace(/^\/+/, "");
}

export const resource = (path) => {
  const clean = stripLeadingSlash(path);
  return {
    list: (params) => api.get(`/${clean}/`, { params }).then((r) => r.data),
    get: (id) => api.get(`/${clean}/${id}/`).then((r) => r.data),
    create: (data) =>
      api.post(`/${clean}/`, data, getConfig(data)).then((r) => r.data),
    update: (id, data) =>
      api.patch(`/${clean}/${id}/`, data, getConfig(data)).then((r) => r.data),
    remove: (id) => api.delete(`/${clean}/${id}/`),
    destroy: (id) => api.delete(`/${clean}/${id}/`),
    action: (id, verb, data) =>
      api.post(`/${clean}/${id}/${verb}/`, data, getConfig(data)).then((r) => r.data),
    collectionAction: (verb, params) =>
      api.get(`/${clean}/${verb}/`, { params }).then((r) => r.data),
  };
};

/** Detect FormData payloads so Axios auto-sets multipart header. */
function getConfig(data) {
  // Don't set Content-Type for FormData - Axios sets it automatically with boundary
  return {};
}

/** Build FormData from an object, converting File inputs. */
export function toFormData(obj) {
  const fd = new FormData();
  Object.entries(obj).forEach(([k, v]) => {
    if (Array.isArray(v)) {
      v.forEach(item => {
        if (item instanceof File || item instanceof Blob) {
          fd.append(k, item, item.name);
        } else if (item !== null && item !== undefined) {
          fd.append(k, String(item));
        }
      });
    } else if (v instanceof File || v instanceof Blob) {
      fd.append(k, v, v.name);
    } else if (v !== null && v !== undefined) {
      fd.append(k, String(v));
    }
  });
  return fd;
}
