/**
 * Owner: Person A — App Shell, Auth, Session & Timer
 *
 * AuthContext provides JWT storage and the authenticated user to the entire
 * React tree. It mirrors the pattern established by apps/admin-web's
 * auth-context.tsx but targets Role.STUDENT instead of Role.ADMIN.
 *
 * Storage strategy: accessToken is kept in memory (no localStorage) to
 * prevent XSS exfiltration. The refreshToken is stored in localStorage
 * only to survive page reloads during an exam — it is rotated on every
 * refresh call, so a stolen token is short-lived.
 *
 * Integration with packages/api-client:
 *   setAccessToken() is called here so every api-client function
 *   automatically includes the Bearer header — no passing tokens around.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { login as apiLogin, logout as apiLogout, refresh as apiRefresh, setAccessToken } from '@secure-exam/api-client';
import type { LoginRequest, LoginResponse } from '@secure-exam/types';
import { getSyncEngine, stopSync } from '../persistence';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
}

// ── Context ────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

const REFRESH_TOKEN_KEY = 'exam_refresh_token';

// Person C's sync engine reports a 401 through this (main.tsx passes it to
// configurePersistence). AuthProvider supplies the handler while it is mounted.
let unauthorizedHandler: (() => void) | null = null;

export function handleUnauthorized(): void {
  unauthorizedHandler?.();
}

// ── Provider ───────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true); // true on mount while we try to restore session
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Helpers ───────────────────────────────────────────────────────────

  const applySession = useCallback((resp: LoginResponse) => {
    setAccessToken(resp.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, resp.refreshToken);
    setUser({
      id: resp.user.id,
      email: resp.user.email,
      fullName: resp.user.fullName,
      role: resp.user.role,
    });
  }, []);

  const clearSession = useCallback(() => {
    stopSync(); // unsynced answers stay stored; AttemptContext resumes them after the next login
    setAccessToken(null);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setUser(null);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  }, []);

  /**
   * Silently refresh the access token 1 minute before it expires.
   * JWT_ACCESS_EXPIRES_IN defaults to "15m" (900 000 ms); we
   * schedule at 840 000 ms (14 min). If the backend config changes
   * the expiry, only this constant needs updating.
   */
  const scheduleRefresh = useCallback(
    (refreshToken: string, delayMs = 14 * 60 * 1000) => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(async () => {
        try {
          const resp = await apiRefresh({ refreshToken });
          // Reconstruct a LoginResponse-shaped object so applySession can be reused.
          // The /auth/refresh endpoint only returns new tokens; keep the existing user.
          setAccessToken(resp.accessToken);
          localStorage.setItem(REFRESH_TOKEN_KEY, resp.refreshToken);
          scheduleRefresh(resp.refreshToken);
        } catch {
          // Refresh failed (token expired / revoked) — force re-login.
          clearSession();
        }
      }, delayMs);
    },
    [clearSession],
  );

  // ── Refresh after a 401 from the sync engine ──────────────────────────

  const isRefreshingRef = useRef(false);

  useEffect(() => {
    unauthorizedHandler = () => {
      const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!storedRefreshToken) {
        clearSession();
        return;
      }
      if (isRefreshingRef.current) return;
      isRefreshingRef.current = true;
      apiRefresh({ refreshToken: storedRefreshToken })
        .then((resp) => {
          setAccessToken(resp.accessToken);
          localStorage.setItem(REFRESH_TOKEN_KEY, resp.refreshToken);
          scheduleRefresh(resp.refreshToken);
          void getSyncEngine().syncNow(); // retry what the 401 interrupted
        })
        .catch(() => clearSession())
        .finally(() => {
          isRefreshingRef.current = false;
        });
    };
    return () => {
      unauthorizedHandler = null;
    };
  }, [clearSession, scheduleRefresh]);

  // ── Session restoration on mount ─────────────────────────────────────

  // StrictMode runs mount effects twice in development. Two concurrent refreshes
  // with the same token can leave localStorage holding the token the server
  // didn't keep, and the next refresh then revokes the session.
  const restoreStartedRef = useRef(false);

  useEffect(() => {
    if (restoreStartedRef.current) return;
    restoreStartedRef.current = true;
    const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!storedRefreshToken) {
      setIsLoading(false);
      return;
    }

    // Attempt silent restoration: exchange the stored refresh token for
    // a fresh access token without showing a login screen.
    apiRefresh({ refreshToken: storedRefreshToken })
      .then((resp) => {
        // We only have tokens here, not a full user object.
        // Decode the access token payload to get user info.
        const payload = parseJwtPayload(resp.accessToken);
        if (!payload) {
          clearSession();
          return;
        }
        setAccessToken(resp.accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, resp.refreshToken);
        setUser({
          id: payload.sub,
          email: payload.email,
          fullName: payload.fullName ?? payload.email,
          role: payload.role,
        });
        scheduleRefresh(resp.refreshToken);
      })
      .catch(() => {
        clearSession();
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [clearSession, scheduleRefresh]);

  // ── Public API ────────────────────────────────────────────────────────

  const login = useCallback(
    async (credentials: LoginRequest) => {
      const resp = await apiLogin(credentials);
      applySession(resp);
      scheduleRefresh(resp.refreshToken);
    },
    [applySession, scheduleRefresh],
  );

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // Ignore network errors on logout — clear session regardless.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, login, logout }),
    [user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

// ── JWT decode helper ─────────────────────────────────────────────────────

/** Lightweight base64url decode — no external dependency needed. */
function parseJwtPayload(token: string): Record<string, string> | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return null;
  }
}

