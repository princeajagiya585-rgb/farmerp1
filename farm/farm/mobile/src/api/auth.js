import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_BASE } from '../config';

// ---- Storage keys -----------------------------------------------------------
const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';
const USER_KEY = 'user';

// ---- JWT helpers (no external library needed) --------------------------------

/**
 * Decode a JWT payload (base64url -> JSON) without a library.
 * Returns null if the token is malformed.
 */
export function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    );
  } catch {
    return null;
  }
}

/**
 * Check whether a JWT access token is expired (or will expire within `bufferSeconds`).
 * Returns true if the token is missing, malformed, or expired.
 */
export function isTokenExpired(token, bufferSeconds = 30) {
  if (!token) return true;
  const decoded = decodeJwtPayload(token);
  if (!decoded || !decoded.exp) return true;
  return decoded.exp * 1000 <= Date.now() + bufferSeconds * 1000;
}

// ---- Storage helpers --------------------------------------------------------

export async function getStoredTokens() {
  const [access, refresh] = await Promise.all([
    AsyncStorage.getItem(ACCESS_KEY),
    AsyncStorage.getItem(REFRESH_KEY),
  ]);
  return { access, refresh };
}

export async function getStoredUser() {
  const raw = await AsyncStorage.getItem(USER_KEY);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function getStored() {
  const [access, refresh, user] = await Promise.all([
    AsyncStorage.getItem(ACCESS_KEY),
    AsyncStorage.getItem(REFRESH_KEY),
    getStoredUser(),
  ]);
  return { access, refresh, user };
}

export async function storeTokens({ access, refresh }) {
  const ops = [];
  if (access) ops.push(AsyncStorage.setItem(ACCESS_KEY, access));
  if (refresh) ops.push(AsyncStorage.setItem(REFRESH_KEY, refresh));
  await Promise.all(ops);
}

export async function storeUser(user) {
  if (user) {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    await AsyncStorage.removeItem(USER_KEY);
  }
}

export async function clearStored() {
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY, USER_KEY]);
}

// ---- Proactive token refresh ------------------------------------------------
// Single-flight: only one refresh at a time, all callers share the same promise.
let refreshPromise = null;

/**
 * Refresh the access token on the server. Returns the new access token.
 * Uses a single-flight pattern so concurrent callers all get the same result.
 */
export async function refreshAccessTokenOnServer() {
  if (refreshPromise) return refreshPromise;

  const storedRefresh = await AsyncStorage.getItem(REFRESH_KEY);
  if (!storedRefresh) {
    refreshPromise = Promise.reject(new Error('No refresh token'));
    // Reset so future calls can try again, but re-throw so callers know
    // the refresh failed (and should treat the user as logged out).
    refreshPromise = refreshPromise.catch((err) => {
      refreshPromise = null;
      throw err;
    });
    return refreshPromise;
  }

  refreshPromise = axios
    .post(`${API_BASE}/auth/refresh/`, { refresh: storedRefresh })
    .then(async ({ data }) => {
      // Store new tokens
      await storeTokens({ access: data.access, refresh: data.refresh });
      return data.access;
    })
    .catch(async (err) => {
      // ── Don't clear stored tokens on transient errors ───────────
      // Network errors (timeout, no internet), server 5xx, or any
      // non-401 error should NOT wipe the user's session. Only clear
      // when the server definitively rejects the refresh token (401).
      // The response interceptor in client.js handles the 401 case
      // by calling clearStored() before redirecting to login.
      //
      // This is critical for persistent login: if the user opens the
      // app without internet (flight mode, poor signal), the stored
      // tokens remain and the session is restored on next successful
      // attempt.
      if (err.response?.status === 401) {
        await clearStored();
      }
      throw err;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

/**
 * Ensure we have a fresh access token before making a request.
 * If the current access token is expired (or about to expire within 30s),
 * proactively refresh it. Returns the fresh access token.
 *
 * On failure (network error, server down, or expired refresh token),
 * returns null but does NOT clear stored tokens. The stored tokens
 * survive so the next app launch can retry the refresh.
 */
export async function ensureFreshAccessToken() {
  const { access, refresh } = await getStoredTokens();

  if (!access || !refresh) {
    return null;
  }

  if (isTokenExpired(access)) {
    try {
      return await refreshAccessTokenOnServer();
    } catch {
      // Refresh failed — keep stored tokens intact for next retry.
      // The response interceptor in client.js will clear them only
      // on a definitive 401 response.
      return null;
    }
  }

  return access;
}

// ---- Auth API calls ---------------------------------------------------------

export async function loginServer(username, password) {
  const { data } = await axios.post(`${API_BASE}/auth/login/`, { username, password });
  await storeTokens({ access: data.access, refresh: data.refresh });
  await storeUser(data.user);
  return data.user;
}

export async function logoutServer() {
  try {
    const refresh = await AsyncStorage.getItem(REFRESH_KEY);
    if (refresh) {
      // Best-effort server-side blacklist
      await axios.post(`${API_BASE}/auth/logout/`, { refresh });
    }
  } catch {
    // Ignore server errors — always clear locally
  }
  await clearStored();
}
