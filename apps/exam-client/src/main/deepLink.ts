// secure-exam://launch/<token> : the browser opens this app on an exam.
// The link comes from outside the app, so only a well-formed one-time launch token
// is accepted. The token is not a password: it works once, expires in about two
// minutes, and is exchanged for a session by the API (POST /auth/exam-launch/redeem).

export const PROTOCOL = 'secure-exam';

/** 32 random bytes, base64url: always 43 characters. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function isLaunchToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN.test(value);
}

/** The launch token in a deep link, or null when the link is not a valid launch link. */
export function tokenFromDeepLink(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== `${PROTOCOL}:` || url.hostname !== 'launch') return null;
  const token = url.pathname.replace(/^\/+|\/+$/g, '');
  return isLaunchToken(token) ? token : null;
}

/** The deep link in a command line (Linux/Windows pass it as an argument), if any. */
export function deepLinkFromArgv(argv: string[]): string | null {
  return argv.find((arg) => arg.startsWith(`${PROTOCOL}://`)) ?? null;
}
