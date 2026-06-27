import { createContext, useContext, useEffect, useState } from "react";
import i18n from "../i18n";
import { api, tokenStore } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored && tokenStore.access) {
      const parsed = JSON.parse(stored);
      setUser(parsed);
      // Apply the cached language immediately (no flash)…
      i18n.changeLanguage(parsed?.preferred_language || "en");
      // …then refresh from the server so any admin-side change (e.g. the
      // language) is picked up on reload — not only after a full re-login.
      api.get("/auth/users/me/")
        .then(({ data }) => {
          setUser(data);
          localStorage.setItem("user", JSON.stringify(data));
          i18n.changeLanguage(data?.preferred_language || "en");
        })
        .catch(() => {});
    }
    setLoading(false);
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
