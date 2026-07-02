import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { loginServer, logoutServer, getStored, ensureFreshAccessToken } from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const appStateRef = useRef(AppState.currentState);

  // ── Startup: restore cached user immediately, refresh in background ──
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { access, refresh, user: storedUser } = await getStored();

      if (!cancelled && storedUser && access) {
        // 1. Restore the cached user RIGHT NOW so the UI renders the
        //    dashboard immediately without flashing the login screen.
        setUser(storedUser);

        // 2. Try to refresh the access token in the background.
        //    If this fails (network error, server down), the user stays
        //    logged in with their cached tokens. The next API call will
        //    handle a 401 response properly if the token is truly invalid.
        if (refresh) {
          try {
            await ensureFreshAccessToken();
          } catch {
            // Silently ignored — stored tokens survive for next retry.
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

  // ── Re-check tokens when app returns from background ────────────────
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        // App came to foreground — proactively refresh if token is stale
        (async () => {
          try {
            await ensureFreshAccessToken();
          } catch {
            // Silently ignored
          }
        })();
      }
      appStateRef.current = nextState;
    });

    return () => subscription.remove();
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
