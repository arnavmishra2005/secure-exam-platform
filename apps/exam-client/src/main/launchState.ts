// The one-time launch token this app was opened with. The page asks for it over IPC
// (so it never sits in a URL) and clears it once it has been redeemed.

import { isLaunchToken } from './deepLink';

let launchToken: string | null = null;

export function setLaunchToken(token: string | null): void {
  launchToken = token && isLaunchToken(token) ? token : null;
}

export function getLaunchToken(): string | null {
  return launchToken;
}
