// The exam app is not a browser. It shows three screens and nothing else:
// the launch/login screen, the exam, and the "submitted" screen.

const ALLOWED = new Set(['/launch', '/student/exam', '/student/exam/submitted']);

export const LAUNCH_PATH = '/launch';
export const EXAM_PATH = '/student/exam';

export function isAllowedAppPath(pathname: string): boolean {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return ALLOWED.has(clean);
}
