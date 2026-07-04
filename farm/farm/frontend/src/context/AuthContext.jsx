import { createContext, useContext, useEffect, useState } from "react";
import i18n from "../i18n";
import { api, tokenStore, isTokenExpired, refreshAccessToken } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const stored = localStorage.getItem("user");
      
      // ── Always restore cached user if available ──────────────────
      // We restore the user from localStorage regardless of token state.
      // This ensures that even if tokens are expired or missing,
      // the user sees their dashboard with cached data immediately.
      // Only explicit sign-out (logout()) removes the user data.
      if (stored) {
        let parsed = null;
        try {
          parsed = JSON.parse(stored);
        } catch {
          // Corrupt cached user — clear it silently.
          localStorage.removeItem("user");
          tokenStore.clear();
        }

        if (parsed) {
          // Apply the cached language immediately (no flash)
          i18n.changeLanguage(parsed?.preferred_language || "en");

          // Set cached user immediately so UI renders without delay
          if (!cancelled) {
            setUser(parsed);
          }

          // ── Proactive token refresh (best-effort) ────────────────
          // If the access token is expired, try to refresh it.
          // This is best-effort — if it fails (network error, server down),
          // we KEEP the cached user. The user stays logged in until they
          // explicitly sign out. The response interceptor will handle
          // 401 errors on subsequent API calls gracefully.
          if (tokenStore.access && isTokenExpired(tokenStore.access) && tokenStore.refresh) {
            try {
              await refreshAccessToken();
            } catch {
              // Refresh failed — silently ignore.
              // The stored tokens survive for the next retry.
              // User stays logged in with cached data.
            }
          }

          // ── Background server sync (best-effort) ─────────────────
          // Refresh user data from the server so admin-side changes
          // (e.g. language preference) are picked up on reload.
          // If this fails (expired token, network issue, deactivated),
          // NEVER clear the cached user — only explicit sign-out via
          // logout() should do that. The API interceptor handles 401
          // errors gracefully and the cached data keeps the UI usable.
          try {
            const { data } = await api.get("/auth/users/me/", { timeout: 15000 });
            if (!cancelled) {
              setUser(data);
              localStorage.setItem("user", JSON.stringify(data));
              i18n.changeLanguage(data?.preferred_language || "en");
            }
          } catch (err) {
            // Sync failed — silently ignore. Keep the cached user.
            // Token refresh and 401 handling are managed by the API interceptor.
          }
        }
      }

      if (!cancelled) {
        setLoading(false);
      }
    })();

    // ── Listen for terminal auth failures ────────────────────────
    // When the API interceptor detects a blacklisted token, it clears the
    // stored tokens + user data and dispatches this event so the context
    // can reactively log the user out.
    const onTokenBlacklisted = () => {
      localStorage.removeItem("user");
      tokenStore.clear();
      if (!cancelled) setUser(null);
    };
    window.addEventListener("auth:token-blacklisted", onTokenBlacklisted);

    return () => {
      cancelled = true;
      window.removeEventListener("auth:token-blacklisted", onTokenBlacklisted);
    };
  }, []);

  // Standard username/password login
  const login = async (username, password) => {
    const { data } = await api.post("/auth/login/", { username, password });
    tokenStore.set({ access: data.access, refresh: data.refresh });
    localStorage.setItem("user", JSON.stringify(data.user));
    setUser(data.user);
    // Language follows the admin-set preference for this user.
    i18n.changeLanguage(data.user?.preferred_language || "en");
    return data.user;
  };

  // Phone + password login
  const loginWithPhone = async (phone, password) => {
    const { data } = await api.post("/auth/login/phone/", { phone, password });
    tokenStore.set({ access: data.access, refresh: data.refresh });
    localStorage.setItem("user", JSON.stringify(data.user));
    setUser(data.user);
    // Language follows the admin-set preference for this user.
    i18n.changeLanguage(data.user?.preferred_language || "en");
    return data.user;
  };

  // Send OTP to phone or email
  const sendOtp = async (identifier) => {
    const { data } = await api.post("/auth/login/send-otp/", { identifier });
    return data;
  };

  // Verify OTP and login
  const loginWithOtp = async (identifier, otp) => {
    const { data } = await api.post("/auth/login/verify-otp/", { identifier, otp });
    tokenStore.set({ access: data.access, refresh: data.refresh });
    localStorage.setItem("user", JSON.stringify(data.user));
    setUser(data.user);
    // Language follows the admin-set preference for this user.
    i18n.changeLanguage(data.user?.preferred_language || "en");
    return data.user;
  };

  const logout = async () => {
    // Save refresh token BEFORE clearing local state so we can still send
    // the server logout request in the background.
    const refreshToken = tokenStore.refresh;
    // Clear local state FIRST — immediate feedback, no waiting for the server.
    tokenStore.clear();
    localStorage.removeItem("user");
    setUser(null);
    // Fire the server logout in the background (best-effort) so the refresh
    // token is blacklisted on the backend too. We do NOT await this because
    // a sleeping backend must not delay the client-side redirect.
    if (refreshToken) {
      api.post("/auth/logout/", { refresh: refreshToken }).catch(() => {});
    }
  };

  const hasRole = (...roles) => user && roles.includes(user.role);

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithPhone, loginWithOtp, sendOtp, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
