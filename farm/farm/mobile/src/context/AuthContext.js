import React, { createContext, useContext, useEffect, useState } from 'react';
import * as api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, hydrate the session from AsyncStorage.
  useEffect(() => {
    (async () => {
      try {
        const { access, user: storedUser } = await api.getStored();
        if (access && storedUser) setUser(storedUser);
      } catch (e) {
        // ignore hydration failures
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (username, password) => {
    const u = await api.login(username, password);
    setUser(u);
    return u;
  };

  const logout = async () => {
    await api.logout();
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
