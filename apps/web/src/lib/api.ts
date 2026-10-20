// Owner: Person A
// Configures the shared api-client once at startup. Screens import endpoint
// wrappers from '@secure-exam/api-client' directly.

import { setApiBaseUrl } from '@secure-exam/api-client';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export function configureApi(): void {
  setApiBaseUrl(API_BASE_URL);
}
