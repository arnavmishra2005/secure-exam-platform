// Owner: Person A (Identity/Auth/Security)
// Base axios instance shared by every *.api.ts wrapper. Attaches the access
// token automatically; admin-web's auth-context is responsible for keeping
// the token in sync (via setAccessToken()).

import axios, { AxiosInstance } from 'axios';

declare const process: {
  env?: {
    NEXT_PUBLIC_API_URL?: string;
    [key: string]: any;
  };
} | undefined;

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

const defaultBaseUrl =
  typeof process !== 'undefined' && process?.env?.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : 'http://localhost:3000';

export const apiClient: AxiosInstance = axios.create({
  baseURL: defaultBaseUrl,
});

export function setApiBaseUrl(url: string): void {
  apiClient.defaults.baseURL = url;
}

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});
