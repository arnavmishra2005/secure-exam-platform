// Owner: Person A
// The API's error body is { statusCode, message } where message may be an array
// (class-validator). Turn any thrown value into one readable sentence.

export function getErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const response = (err as { response?: { status?: number; data?: { message?: unknown } } })?.response;
  const message = response?.data?.message;
  if (Array.isArray(message)) return message.join('. ');
  if (typeof message === 'string' && message.trim()) return message;
  if (!response && (err as { message?: string })?.message === 'Network Error') {
    return 'Cannot reach the server. Check your connection.';
  }
  return fallback;
}

export function getErrorStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}
