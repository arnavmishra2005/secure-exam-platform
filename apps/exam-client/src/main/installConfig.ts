import { existsSync, readFileSync } from 'node:fs';
export function readApiBaseUrl(file: string, override?: string, isDev = false): string {
  const configured = override ?? (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).apiBaseUrl : undefined);
  if (!configured && !isDev) throw new Error(`Set apiBaseUrl in ${file} before starting the exam app.`);
  const url = new URL(configured ?? 'http://localhost:3000');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid exam API URL');
  if (!isDev && url.protocol !== 'https:') throw new Error('The installed exam app requires an HTTPS server URL.');
  return url.href.replace(/\/$/, '');
}
