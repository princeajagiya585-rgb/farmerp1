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
const MAX_RECONNECT_RETRIES = 10; // After 10 retries (~30s), fall back to polling

// ── WebSocket Base URL ──────────────────────────────────────────────────
//  ⚠️  Vercel does NOT proxy WebSocket connections (rewrites only work for
//     HTTP). So WebSocket connections MUST go directly to the Railway backend.
//
//  Production:  Set VITE_WS_URL in Vercel Dashboard to Railway WebSocket URL
//               (e.g. "wss://farmerp-backend-production.up.railway.app").
//               If NOT set, it defaults to the same URL using the https→wss
//               protocol swap from VITE_API_URL (if set) or the hardcoded default.
//
//  Development: Falls back to ws://localhost:8000 (the Daphne dev server).
function resolveWsBase() {
  // 1. If VITE_WS_URL is explicitly set, use it (highest priority)
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;

  // 2. In production, derive from VITE_API_URL or use the default Railway URL
  if (!import.meta.env.DEV) {
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl) {
      // Derive WS URL from API URL: https://... → wss://...
      return apiUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
    }
    return "wss://farmerp-backend-production.up.railway.app";
  }

  // 3. Development: fall back to localhost
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.hostname}:8000`;
}
const WS_BASE = resolveWsBase();

if (!import.meta.env.DEV && !import.meta.env.VITE_WS_URL) {
  console.log(
    "[WS] VITE_WS_URL not set — using default:", WS_BASE,
    "Set VITE_WS_URL in Vercel env vars if connecting to a different backend."
  );
}

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
  let pollingFallback = false;

  const getToken = () => localStorage.getItem("access");

  function cleanup() {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (ws) {
      const sock = ws;
      sock.onclose = sock.onmessage = sock.onerror = null;
      // Avoid the "closed before the connection is established" console warning
      // by deferring close of a still-CONNECTING socket until it opens.
      if (sock.readyState === WebSocket.CONNECTING) {
        sock.onopen = () => { try { sock.close(); } catch { /* ignore */ } };
      } else {
        sock.onopen = null;
        try { sock.close(); } catch { /* ignore */ }
      }
      ws = null;
    }
  }

  if (signal) {
    signal.addEventListener("abort", cleanup, { once: true });
  }

  // ── HTTP polling fallback ──────────────────────────────────────────
  // When WebSocket fails after max retries, switch to polling the
  // notifications endpoint every 15 seconds as a degraded fallback.
  function startPollingFallback() {
    if (stopped || pollingFallback) return;
    pollingFallback = true;
    onStatus?.("polling");
    console.warn("[WS] WebSocket unavailable after max retries — falling back to HTTP polling.");

    let pollTimer = null;
    // Track already-delivered notification ids so repeated polls of the unread
    // list don't re-deliver the same items. The first poll only seeds this set
    // (no delivery) so we don't replay every pre-existing unread notification.
    const seen = new Set();
    let seeded = false;
    async function poll() {
      if (stopped) return;
      try {
        const token = getToken();
        if (!token) return;
        const { default: { api } } = await import("./api");
        // Real endpoint: the unread list (paginated `results`). The old
        // `/notifications/unread/` route does not exist and 404'd silently.
        const { data } = await api.get("/notifications/", {
          params: { is_read: false, page_size: 20 },
        });
        const items = (data && data.results) || (Array.isArray(data) ? data : []);
        const fresh = items.filter((m) => m && m.id != null && !seen.has(m.id));
        items.forEach((m) => m && m.id != null && seen.add(m.id));
        if (seeded) {
          // Deliver oldest-first so the newest ends up on top after prepend.
          fresh.reverse().forEach((msg) => onMessage?.(msg));
        }
        seeded = true;
      } catch {
        // Silently retry on next poll cycle
      }
      if (!stopped) {
        pollTimer = setTimeout(poll, 15000);
      }
    }
    poll();
    return () => {
      if (pollTimer) clearTimeout(pollTimer);
    };
  }

  function connect() {
    if (stopped) return;

    // After max retries, give up on WebSocket and use polling
    if (retries >= MAX_RECONNECT_RETRIES) {
      startPollingFallback();
      return;
    }

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
  let pollingFallback = false;

  const getToken = () => localStorage.getItem("access");

  function cleanup() {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (ws) {
      const sock = ws;
      sock.onclose = sock.onmessage = sock.onerror = null;
      // Closing a socket that is still CONNECTING logs a noisy console warning
      // ("WebSocket is closed before the connection is established"). Defer the
      // close until it actually opens in that case.
      if (sock.readyState === WebSocket.CONNECTING) {
        sock.onopen = () => { try { sock.close(); } catch { /* ignore */ } };
      } else {
        sock.onopen = null;
        try { sock.close(); } catch { /* ignore */ }
      }
      ws = null;
    }
  }

  if (signal) {
    signal.addEventListener("abort", cleanup, { once: true });
  }

  // ── HTTP polling fallback ──────────────────────────────────────────
  // When WebSocket fails after max retries, switch to polling the
  // GPS pings endpoint every 10 seconds as a degraded fallback.
  function startPollingFallback() {
    if (stopped || pollingFallback) return;
    pollingFallback = true;
    onStatus?.("polling");
    console.warn("[WS] GPS WebSocket unavailable after max retries — falling back to HTTP polling.");

    let pollTimer = null;
    async function poll() {
      if (stopped) return;
      try {
        const token = getToken();
        if (!token) return;
        const { default: { api } } = await import("./api");
        const { data } = await api.get("/gps/pings/?page_size=20");
        if (data && data.results) {
          data.results.forEach(ping => onMessage?.({ _type: "location_ping", ...ping }));
        }
      } catch {
        // Silently retry on next poll cycle
      }
      if (!stopped) {
        pollTimer = setTimeout(poll, 10000);
      }
    }
    poll();
    return () => {
      if (pollTimer) clearTimeout(pollTimer);
    };
  }

  function connect() {
    if (stopped) return;

    // After max retries, give up on WebSocket and use polling
    if (retries >= MAX_RECONNECT_RETRIES) {
      startPollingFallback();
      return;
    }

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
