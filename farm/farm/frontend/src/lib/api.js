import axios from "axios";

// ── API Base URL ────────────────────────────────────────────────────────
//  Production (Vercel): use relative URLs → vercel.json rewrites /api/* → Railway.
//  Development:         use VITE_API_URL (if set) or Vite proxy → localhost:8000.
const API_ORIGIN = import.meta.env.PROD
  ? ""
  : (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const API_BASE = `${API_ORIGIN}/api/v1`;

export const api = axios.create({ baseURL: API_BASE });

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

api.interceptors.request.use((config) => {
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Single-flight token refresh: every request that hits a 401 at the same time
// shares ONE refresh call. The promise is only cleared once it has fully
// settled (in `finally`), so a later wave of 401s can never start a second
// refresh with an already-rotated (blacklisted) refresh token — that race was
// what produced spurious "Authentication credentials were not provided" errors
// and surprise logouts once the access token expired.
let refreshPromise = null;

function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE}/auth/refresh/`, { refresh: tokenStore.refresh })
      .then(({ data }) => {
        tokenStore.set({ access: data.access, refresh: data.refresh });
        return data.access;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function redirectToLogin() {
  tokenStore.clear();
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const isAuthEndpoint = original?.url?.includes("/auth/login") || original?.url?.includes("/auth/refresh");
    if (error.response?.status === 401 && original && !original._retry && !isAuthEndpoint) {
      if (!tokenStore.refresh) {
        redirectToLogin();
        return Promise.reject(error);
      }
      original._retry = true;
      try {
        const access = await refreshAccessToken();
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${access}`;
        return api(original);
      } catch (e) {
        redirectToLogin();
        return Promise.reject(e);
      }
    }
    return Promise.reject(error);
  }
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
