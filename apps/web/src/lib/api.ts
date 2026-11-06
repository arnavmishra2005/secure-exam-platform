import { setApiBaseUrl } from '@secure-exam/api-client';

declare global { interface Window { __EXAM_CONFIG__?: { apiBaseUrl?: string }; } }
export function resolveApiBaseUrl(runtime?: string): string {
  const base = runtime ?? import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://localhost:3000' : '/api');
  if (base.startsWith('/') && !base.startsWith('//')) return base.replace(/\/$/, '');
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid exam API URL');
  return url.href.replace(/\/$/, '');
}
export async function configureApi(): Promise<void> {
  const desktopUrl = await window.desktop?.getApiBaseUrl?.();
  // The shipped /api config is for production; normal Vite development keeps .env behavior.
  const runtime = desktopUrl ?? (import.meta.env.DEV ? undefined : window.__EXAM_CONFIG__?.apiBaseUrl);
  setApiBaseUrl(resolveApiBaseUrl(runtime));
}
