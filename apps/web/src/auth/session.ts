// Owner: Person A
// Framework-free session plumbing: the refresh token in localStorage, a
// single-flight refresh, and an axios interceptor that refreshes once on a
// 401 and retries the request. Features that keep per-session state (the
// exam client's sync engine) subscribe with onSessionEvent.

import { apiClient, refresh as refreshRequest, setAccessToken } from '@secure-exam/api-client';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';

const REFRESH_TOKEN_KEY = 'secure-exam.web.refreshToken';

export type SessionEvent = 'refreshed' | 'ended';
type Listener = (event: SessionEvent) => void;

const listeners = new Set<Listener>();
let refreshInFlight: Promise<string | null> | null = null;

export function onSessionEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(event: SessionEvent): void {
  for (const listener of listeners) listener(event);
}

export function getStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeTokens(accessToken: string, refreshToken: string): void {
  setAccessToken(accessToken);
  try {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } catch {
    // Private mode: the session lasts until the tab closes.
  }
}

export function clearTokens(): void {
  setAccessToken(null);
  try {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // ignore
  }
  emit('ended');
}

/**
 * Exchanges the stored refresh token for a new pair. Concurrent callers share
 * one request: refresh tokens rotate, so two parallel refreshes with the same
 * token would revoke the session. Resolves the new access token, or null.
 */
export function refreshSession(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return Promise.resolve(null);

  refreshInFlight = refreshRequest({ refreshToken })
    .then(({ accessToken, refreshToken: next }) => {
      storeTokens(accessToken, next);
      emit('refreshed');
      return accessToken;
    })
    .catch(() => {
      clearTokens();
      return null;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

let interceptorInstalled = false;

/** Retries a request once after refreshing on a 401. Auth endpoints are never retried. */
export function installAuthInterceptor(): void {
  if (interceptorInstalled) return;
  interceptorInstalled = true;

  apiClient.interceptors.response.use(undefined, async (error: AxiosError) => {
    const config = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const isAuthCall = config?.url?.startsWith('/auth/');
    if (error.response?.status !== 401 || !config || config._retried || isAuthCall) {
      throw error;
    }
    config._retried = true;
    const accessToken = await refreshSession();
    if (!accessToken) throw error;
    config.headers.Authorization = `Bearer ${accessToken}`;
    return apiClient.request(config);
  });
}
