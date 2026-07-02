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
      if (stored && tokenStore.access) {
        // A corrupt cached user (partial write, manual edit) must not throw and
        // leave the app stuck on the loading screen — fall back to logged-out.
        let parsed = null;
        try {
          parsed = JSON.parse(stored);
        } catch {
          localStorage.removeItem("user");
          tokenStore.clear();
        }

        if (parsed) {
          // Apply the cached language immediately (no flash)…
          i18n.changeLanguage(parsed?.preferred_language || "en");

          // ── Proactive token refresh ───────────────────────────────
          // If the access token is already expired, refresh it BEFORE
          // making any API calls. This prevents the initial 401 burst
          // on page reload.
          if (isTokenExpired(tokenStore.access) && tokenStore.refresh) {
            try {
              await refreshAccessToken();
            } catch {
              // Refresh failed (refresh token expired / blacklisted).
              // Clear everything and force re-login.
              tokenStore.clear();
              localStorage.removeItem("user");
              if (!cancelled) {
                setUser(null);
                setLoading(false);
              }
              return;
            }
          }

          // Still have a valid token (original or refreshed) — set the
          // cached user immediately so the UI renders without delay, then
          // verify from the server in the background.
          if (!cancelled) {
            setUser(parsed);
          }

          // …refresh from the server so any admin-side change (e.g. the
          // language) is picked up on reload — not only after a full re-login.
          // Use a 15-second timeout so a sleeping Railway backend doesn't
          // block the loading screen indefinitely.
          try {
            const { data } = await api.get("/auth/users/me/", { timeout: 15000 });
            if (!cancelled) {
              setUser(data);
              localStorage.setItem("user", JSON.stringify(data));
              i18n.changeLanguage(data?.preferred_language || "en");
            }
          } catch {
            // /auth/users/me/ failed even after a proactive refresh.
            // The response interceptor already tried to handle 401 by
            // refreshing, so if we're here, something is truly wrong
            // (network error, server down, or refresh token also expired).
            // Keep the cached user — they can still navigate the app
            // and the interceptor will redirect to login on the next
            // protected request if the token is truly invalid.
          }
        }
      }

      if (!cancelled) {
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
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

  const logout = () => {
    tokenStore.clear();
    localStorage.removeItem("user");
    setUser(null);
  };

  const hasRole = (...roles) => user && roles.includes(user.role);

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithPhone, loginWithOtp, sendOtp, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
