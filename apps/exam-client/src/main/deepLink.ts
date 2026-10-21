// secure-exam://exam/<examId> : lets the browser dashboard open this app on an exam.
// The link comes from outside the app, so only a well-formed exam id is accepted
// and it is mapped to a fixed in-app path. Nothing else is ever navigated to.

export const PROTOCOL = 'secure-exam';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The in-app path for a deep link, or null when the link is not a valid exam link. */
export function pathForDeepLink(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== `${PROTOCOL}:` || url.hostname !== 'exam') return null;
  const id = url.pathname.replace(/^\/+|\/+$/g, '');
  return UUID.test(id) ? `/student/exams/${id.toLowerCase()}` : null;
}

/** The deep link in a command line (Linux/Windows pass it as an argument), if any. */
export function deepLinkFromArgv(argv: string[]): string | null {
  return argv.find((arg) => arg.startsWith(`${PROTOCOL}://`)) ?? null;
}
