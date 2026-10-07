// Owner: Person A (Identity/Auth/Security)
// Base axios instance shared by every *.api.ts wrapper. Attaches the access
// token automatically; admin-web's auth-context is responsible for keeping
// the token in sync (via setAccessToken()).

import axios, { AxiosInstance } from 'axios';

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

// Next.js inlines NEXT_PUBLIC_API_URL at build time, but only where the exact
// expression `process.env.NEXT_PUBLIC_API_URL` appears, so keep it spelled out.
// Bundles without a `process` global (the Vite exam client) throw here and use
// the default; they call setApiBaseUrl() at startup instead.
function defaultBaseUrl(): string {
  try {
    return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
  } catch {
    return 'http://localhost:3000';
  }
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: defaultBaseUrl(),
});

export function setApiBaseUrl(url: string): void {
  apiClient.defaults.baseURL = url;
}

export const setBaseURL = setApiBaseUrl;

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});
