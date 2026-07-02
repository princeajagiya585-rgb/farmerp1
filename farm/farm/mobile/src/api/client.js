import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../config';
import {
  ensureFreshAccessToken,
  getStoredTokens,
  storeTokens,
  clearStored,
  isTokenExpired,
  refreshAccessTokenOnServer,
  getStored as getStoredFromAuth,
  loginServer,
  logoutServer as logoutServerFromAuth,
} from './auth';

// AsyncStorage keys
const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';
const USER_KEY = 'user';

// Axios instance pointed at the FarmERP Pro backend.
const client = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
});

// ---- Request interceptor: attach Bearer token + proactive refresh -----------
client.interceptors.request.use(async (config) => {
  // Skip auth endpoints — login and refresh don't need a token
  const url = config.url || '';
  if (
    url.includes('/auth/login') ||
    url.includes('/auth/refresh') ||
    url.includes('/auth/logout')
  ) {
    return config;
  }

  // Proactively refresh the access token if it's expired.
  // This eliminates the 401 -> refresh -> retry cycle for the common case
  // where the access token expired while the user was idle.
  const freshToken = await ensureFreshAccessToken();
  if (freshToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${freshToken}`;
  }

  return config;
});

// ---- Response interceptor: refresh access token on 401 -----------------------
let isRefreshing = false;
let pendingQueue = [];

const processQueue = (error, token = null) => {
  pendingQueue.forEach((p) => {
    if (error) p.reject(error);
    else p.resolve(token);
  });
  pendingQueue = [];
};

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response ? error.response.status : null;

    // Only try to refresh once per request, and never for the refresh call itself.
    if (
      status === 401 &&
      original &&
      !original._retry &&
      !String(original.url || '').includes('/auth/refresh')
    ) {
      original._retry = true;

      const { refresh } = await getStoredTokens();
      if (!refresh) {
        // No refresh token — can't recover, force re-login
        await clearStored();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Queue requests while a refresh is already in flight.
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return client(original);
        });
      }

      isRefreshing = true;
      try {
        const freshToken = await refreshAccessTokenOnServer();
        original.headers.Authorization = `Bearer ${freshToken}`;
        processQueue(null, freshToken);
        return client(original);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        await clearStored();
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ---- Storage helpers ---------------------------------------------------------
export async function getStored() {
  return getStoredFromAuth();
}

// ---- Auth helpers ------------------------------------------------------------
export async function login(username, password) {
  return loginServer(username, password);
}

export async function logout() {
  await logoutServerFromAuth();
}

export default client;
