// Owner: Person A
// One sign-in for admins and students. The access token lives in memory
// (api-client); the refresh token in localStorage so a reload — including in
// the middle of an exam — restores the session without a login screen.

import { getMe, login as loginRequest, logout as logoutRequest } from '@secure-exam/api-client';
import { Role } from '@secure-exam/types';
import type { LoginResponse } from '@secure-exam/types';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { clearTokens, onSessionEvent, refreshSession, storeTokens } from './session';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** True until the stored session has been restored or ruled out. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  /** Adopt a session issued another way (the exam app's one-time launch token). */
  signInWithSession: (session: LoginResponse) => AuthUser;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// StrictMode mounts effects twice in development; restore exactly once per page load.
let restorePromise: Promise<AuthUser | null> | null = null;

function restoreSession(): Promise<AuthUser | null> {
  restorePromise ??= refreshSession().then(async (accessToken) => {
    if (!accessToken) return null;
    try {
      return (await getMe()) as AuthUser;
    } catch {
      clearTokens();
      return null;
    }
  });
  return restorePromise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    restoreSession().then((restored) => {
      if (cancelled) return;
      setUser(restored);
      setIsLoading(false);
    });
    // A failed refresh anywhere (e.g. a 401 mid-exam) signs the user out here too.
    const unsubscribe = onSessionEvent((event) => {
      if (event === 'ended') setUser(null);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await loginRequest({ email, password });
    storeTokens(response.accessToken, response.refreshToken);
    const signedIn = response.user as AuthUser;
    setUser(signedIn);
    return signedIn;
  }, []);

  const signInWithSession = useCallback((session: LoginResponse) => {
    storeTokens(session.accessToken, session.refreshToken);
    const signedIn = session.user as AuthUser;
    setUser(signedIn);
    return signedIn;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // Sign out locally whether or not the server heard us.
    } finally {
      restorePromise = null;
      clearTokens();
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, signInWithSession, logout }),
    [user, isLoading, login, signInWithSession, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Where each role lands after signing in. */
export function homePathFor(role: Role | string | undefined): string {
  return role === Role.ADMIN ? '/admin/exams' : '/student/dashboard';
}
