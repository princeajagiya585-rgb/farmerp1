/**
 * WebSocket connection manager for real-time location updates in React Native.
 *
 * Authenticates via the stored JWT token and delivers parsed messages to a
 * callback.  Auto-reconnects with exponential backoff.  Returns a cleanup
 * function for useEffect.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../config';

// Derive the WebSocket base from the HTTP API base.
// E.g. http://10.0.2.2:8000/api/v1 → ws://10.0.2.2:8000
const HTTP_BASE = API_BASE.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
const WS_BASE = HTTP_BASE.replace(/^http/, 'ws');

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

/**
 * Open a WebSocket that delivers parsed location-ping messages to `onMessage`.
 *
 * @param {object}   options
 * @param {Function} options.onMessage - Called with parsed JSON for each message.
 * @param {Function} options.onStatus  - Called with 'connected' | 'disconnected' | 'reconnecting'.
 * @returns {Function} Cleanup function to close the connection.
 */
export function connectLocationStream({ onMessage, onStatus }) {
  let ws = null;
  let retries = 0;
  let timer = null;
  let stopped = false;

  function cleanup() {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (ws) {
      ws.onopen = ws.onclose = ws.onmessage = ws.onerror = null;
      ws.close();
      ws = null;
    }
  }

  async function connect() {
    if (stopped) return;

    const token = await AsyncStorage.getItem('access_token');
    if (!token) {
      scheduleReconnect();
      return;
    }

    const url = `${WS_BASE}/ws/gps/live/?token=${encodeURIComponent(token)}`;
    ws = new WebSocket(url);

    ws.onopen = () => {
      retries = 0;
      onStatus?.('connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      ws = null;
      if (!stopped) {
        onStatus?.('reconnecting');
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // onclose fires next → triggers reconnect
    };
  }

  function scheduleReconnect() {
    if (stopped) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** retries, RECONNECT_MAX_MS);
    retries += 1;
    timer = setTimeout(connect, delay);
  }

  connect();

  return cleanup;
}
