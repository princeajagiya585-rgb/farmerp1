import React, { createContext, useContext, useEffect, useState } from 'react';
import { loginServer, logoutServer, clearStored, getStored, ensureFreshAccessToken } from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, hydrate the session from AsyncStorage and verify token validity.
  useEffect(() => {
    (async () => {
      try {
        const { access, refresh, user: storedUser } = await getStored();
        if (access && storedUser) {
          // Proactively refresh if the access token is expired so the user
          // doesn't hit a 401 on the very first API call after app restart.
          if (refresh) {
            await ensureFreshAccessToken();
          }
          setUser(storedUser);
        }
      } catch (e) {
        // Ignore hydration failures — user stays logged out
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (username, password) => {
    const u = await loginServer(username, password);
    setUser(u);
    return u;
  };

  const logout = async () => {
    // Call the server to blacklist the refresh token, then clear local state.
    // This ensures the refresh token can't be reused after logout.
    await logoutServer();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
