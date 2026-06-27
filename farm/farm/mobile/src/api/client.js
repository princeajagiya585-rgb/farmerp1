import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../config';

// AsyncStorage keys
const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';
const USER_KEY = 'user';

// Axios instance pointed at the FarmERP Pro backend.
const client = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

// ---- Request interceptor: attach Bearer token --------------------------------
client.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(ACCESS_KEY);
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
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

      const refresh = await AsyncStorage.getItem(REFRESH_KEY);
      if (!refresh) {
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
        const { data } = await axios.post(`${API_BASE}/auth/refresh/`, { refresh });
        await AsyncStorage.setItem(ACCESS_KEY, data.access);
        if (data.refresh) await AsyncStorage.setItem(REFRESH_KEY, data.refresh);
        processQueue(null, data.access);
        original.headers.Authorization = `Bearer ${data.access}`;
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
  const [access, refresh, userRaw] = await Promise.all([
    AsyncStorage.getItem(ACCESS_KEY),
    AsyncStorage.getItem(REFRESH_KEY),
    AsyncStorage.getItem(USER_KEY),
  ]);
  let user = null;
  try {
    user = userRaw ? JSON.parse(userRaw) : null;
  } catch (e) {
    user = null;
  }
  return { access, refresh, user };
}

async function clearStored() {
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY, USER_KEY]);
}

// ---- Auth helpers ------------------------------------------------------------
export async function login(username, password) {
  const { data } = await client.post('/auth/login/', { username, password });
  await AsyncStorage.setItem(ACCESS_KEY, data.access);
  await AsyncStorage.setItem(REFRESH_KEY, data.refresh);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
  return data.user;
}

export async function logout() {
  await clearStored();
}

export default client;
