/**
 * WebSocket connection manager for real-time location updates.
 *
 * Connects to the backend Channels WebSocket, authenticates with the stored
 * JWT token, and invokes a callback on every incoming message.  Automatically
 * reconnects with exponential backoff on disconnect.  Exposes a cleanup
 * function for React useEffect.
 */

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

// ── WebSocket Base URL ──────────────────────────────────────────────────
//  Production:  VITE_WS_URL must be set in Vercel dashboard to Railway WS URL.
//               Vercel does NOT proxy WebSocket connections, so a direct URL is
//               required: wss://farmerp-backend-production.up.railway.app
//  Development: falls back to ws://localhost:8000 (the Daphne dev server).
function resolveWsBase() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  if (import.meta.env.PROD) {
    // Default to Railway WebSocket in production
    return "wss://farmerp-backend-production.up.railway.app";
  }
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.hostname}:8000`;
}
const WS_BASE = resolveWsBase();

// Enabled by default; set VITE_ENABLE_WEBSOCKET="false" to fall back to polling only.
const ENABLE_WEBSOCKET = import.meta.env.VITE_ENABLE_WEBSOCKET !== "false";

/**
 * Open a WebSocket that delivers parsed location-ping messages to onMessage.
 *
 * @param {object}   options
 * @param {Function} options.onMessage - Called with parsed JSON for each message.
 * @param {Function} options.onStatus  - Called with "connected" | "disconnected" | "reconnecting".
 * @param {AbortSignal} [options.signal] - Optional AbortSignal to stop.
 * @returns {Function} Cleanup function to close the connection.
 */
/**
 * Open a WebSocket that delivers parsed notification messages in real time.
 *
 * @param {object}   options
 * @param {Function} options.onMessage - Called with parsed JSON for each new notification.
 * @param {Function} options.onStatus  - Called with "connected" | "disconnected" | "reconnecting".
 * @param {AbortSignal} [options.signal] - Optional AbortSignal to stop.
 * @returns {Function} Cleanup function to close the connection.
 */
export function connectNotificationStream({ onMessage, onStatus, signal }) {
  // Disable WebSocket if not enabled (e.g., in development with Django runserver)
  if (!ENABLE_WEBSOCKET) {
    return () => {};
  }

  let ws = null;
  let retries = 0;
  let timer = null;
  let stopped = false;

  const getToken = () => localStorage.getItem("access");

  function cleanup() {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (ws) {
      ws.onopen = ws.onclose = ws.onmessage = ws.onerror = null;
      try { ws.close(); } catch { /* ignore */ }
      ws = null;
    }
  }

  if (signal) {
    signal.addEventListener("abort", cleanup, { once: true });
  }

  function connect() {
    if (stopped) return;
    const token = getToken();
    if (!token) {
      scheduleReconnect();
      return;
    }
    try {
      const url = `${WS_BASE}/ws/notifications/?token=${encodeURIComponent(token)}`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        retries = 0;
        onStatus?.("connected");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage(data);
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        ws = null;
        if (!stopped) {
          onStatus?.("reconnecting");
          scheduleReconnect();
        }
      };

      ws.onerror = () => {};
    } catch {
      if (!stopped) scheduleReconnect();
    }
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


export function connectLocationStream({ onMessage, onStatus, signal }) {
  // Disable WebSocket if not enabled (e.g., in development with Django runserver)
  if (!ENABLE_WEBSOCKET) {
    return () => {};
  }

  let ws = null;
  let retries = 0;
  let timer = null;
  let stopped = false;

  const getToken = () => localStorage.getItem("access");

  function cleanup() {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (ws) {
      ws.onopen = ws.onclose = ws.onmessage = ws.onerror = null;
      try {
        ws.close();
      } catch (e) {
        // Ignore any close errors
      }
      ws = null;
    }
  }

  if (signal) {
    signal.addEventListener("abort", cleanup, { once: true });
  }

  function connect() {
    if (stopped) return;

    const token = getToken();
    if (!token) {
      // No token yet — retry after a short delay
      scheduleReconnect();
      return;
    }

    try {
      const url = `${WS_BASE}/ws/gps/live/?token=${encodeURIComponent(token)}`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        retries = 0;
        onStatus?.("connected");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage(data);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = (event) => {
        ws = null;
        if (!stopped) {
          onStatus?.("reconnecting");
          scheduleReconnect();
        }
      };

      ws.onerror = () => {
        // Don't log anything to keep console clean, onclose will handle reconnect
      };
    } catch (e) {
      // Silent fail and retry
      if (!stopped) {
        scheduleReconnect();
      }
    }
  }

  function scheduleReconnect() {
    if (stopped) return;
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** retries,
      RECONNECT_MAX_MS,
    );
    retries += 1;
    timer = setTimeout(connect, delay);
  }

  connect();

  return cleanup;
}
