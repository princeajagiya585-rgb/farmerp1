import axios from "axios";

// ── API Base URL ────────────────────────────────────────────────────────
//  Production: leave blank → same-origin requests go through Vercel proxy.
//               To call Railway directly, set VITE_API_URL in Vercel Dashboard.
//  Development: leave blank → Vite proxy forwards /api to localhost:8000.
const API_ORIGIN = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const API_BASE = `${API_ORIGIN}/api/v1`;

export const api = axios.create({ baseURL: API_BASE });

// ── Photo/Media URL Normalizer ────────────────────────────────────────
// Converts relative URLs (/media/...) to absolute URLs that work in both
// development and production. In production, relative URLs are proxied
// through Vercel to Railway, so we just need to ensure the URL starts
// with /media/ for the proxy to work.
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
// In Railway this burst can trigger rate limits. We limit to 3 concurrent
// requests and queue the rest.
let inFlight = 0;
const requestQueue = [];
const MAX_CONCURRENCY = 3;

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

    // ── Proactive token refresh ─────────────────────────────────────
    // Instead of waiting for a 401 response, refresh the access token
    // *before* sending the request if it has expired. This eliminates
    // the initial 401 burst on page load / after login.
    const currentAccess = tokenStore.access;
    if (currentAccess && isTokenExpired(currentAccess) && tokenStore.refresh) {
      try {
        await refreshAccessToken();
      } catch {
        // Refresh failed — silently ignored.
        // The API call will proceed with the expired token; if the
        // server returns a 401, the interceptor will try again.
      }
    }

    const token = tokenStore.access;
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return originalRequest(config);
  };
  return enqueueRequest(doRequest);
};

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

    // Handle 429 Too Many Requests — activate a global cooldown
    // instead of retrying (retrying would compound the load).
    if (error.response?.status === 429) {
      const retryAfter = parseInt(error.response.headers["retry-after"] || "10", 10);
      activateGlobalCooldown(retryAfter);
      return Promise.reject(error);
    }

    // Wait for global cooldown on every erroring request before proceeding
    if (isInGlobalCooldown()) {
      const wait = globalCooldownUntil - Date.now();
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }

    // ── 401 Unauthorized: Try token refresh ────────────────────────
    // If the request is NOT an auth endpoint (login/refresh), intercept
    // the 401, refresh the token (once, with retry limit), and retry.
    // If the refresh itself fails (including "Token is blacklisted"),
    // the refreshAccessToken() will have already cleared the tokens
    // and the request is rejected without further retries.
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

// Generic REST helpers for a DRF resource (paginated).
export const resource = (path) => ({
  list: (params) => api.get(`/${path}/`, { params }).then((r) => r.data),
  get: (id) => api.get(`/${path}/${id}/`).then((r) => r.data),
  create: (data) =>
    api.post(`/${path}/`, data, getConfig(data)).then((r) => r.data),
  update: (id, data) =>
    api.patch(`/${path}/${id}/`, data, getConfig(data)).then((r) => r.data),
  remove: (id) => api.delete(`/${path}/${id}/`),
  destroy: (id) => api.delete(`/${path}/${id}/`),
  action: (id, verb, data) =>
    api.post(`/${path}/${id}/${verb}/`, data, getConfig(data)).then((r) => r.data),
  collectionAction: (verb, params) =>
    api.get(`/${path}/${verb}/`, { params }).then((r) => r.data),
});

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
