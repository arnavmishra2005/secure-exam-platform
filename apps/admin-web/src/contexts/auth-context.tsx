// Owner: Person A (Identity/Auth/Security)
// Shared infrastructure the other two people's screens import via useAuth().
// Access token lives only in memory (React state) — it's never persisted, so
// a stolen localStorage/XSS payload can't lift it directly. The refresh
// token is kept in localStorage for this Phase 1 SPA; swapping it for an
// httpOnly cookie set by a same-origin proxy route is a good hardening step
// once the admin portal has its own backend-for-frontend.

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Role } from '@secure-exam/types';
import { login as loginRequest, logout as logoutRequest, refresh as refreshRequest, setAccessToken } from '@/lib/api';

const REFRESH_TOKEN_KEY = 'secure-exam.refreshToken';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applySession = useCallback((accessToken: string, refreshToken: string, sessionUser: AuthUser) => {
    setAccessToken(accessToken);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    setUser(sessionUser);
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    setUser(null);
  }, []);

  // On first load, try to silently resume a session from the stored refresh
  // token so a page reload doesn't force a re-login every time.
  useEffect(() => {
    const storedRefreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!storedRefreshToken) {
      setIsLoading(false);
      return;
    }

    refreshRequest({ refreshToken: storedRefreshToken })
      .then(({ accessToken, refreshToken }) => {
        setAccessToken(accessToken);
        window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
        // The refresh endpoint doesn't return the user profile, so decode
        // just enough from the JWT payload to populate the session locally.
        const payload = JSON.parse(atob(accessToken.split('.')[1])) as {
          sub: string;
          email: string;
          role: Role;
        };
        setUser({ id: payload.sub, email: payload.email, fullName: payload.email, role: payload.role });
      })
      .catch(() => {
        window.localStorage.removeItem(REFRESH_TOKEN_KEY);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await loginRequest({ email, password });
      applySession(response.accessToken, response.refreshToken, response.user);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(() => ({ user, isLoading, login, logout }), [user, isLoading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
