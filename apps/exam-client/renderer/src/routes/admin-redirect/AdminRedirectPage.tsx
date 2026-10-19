/**
 * TEMPORARY — ponytail: remove when Person A/B deliver unified shell with admin panel embedded.
 *
 * Shown inside Electron when an ADMIN logs in.
 * Admin portal runs separately; this page just bounces them there.
 */

import { useAuth } from '../../hooks/useAuth';

const ADMIN_URL = import.meta.env.VITE_ADMIN_URL ?? 'http://localhost:3001';

export default function AdminRedirectPage() {
  const { user, logout } = useAuth();
  const refreshToken = localStorage.getItem('exam_refresh_token') ?? '';
  const targetUrl = refreshToken
    ? `${ADMIN_URL}/students?refreshToken=${encodeURIComponent(refreshToken)}`
    : `${ADMIN_URL}/students`;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-indigo-600 px-8 py-6">
          <h1 className="text-xl font-bold text-white">Admin Portal</h1>
          <p className="text-indigo-200 text-sm mt-1">Signed in as {user?.email}</p>
        </div>
        <div className="px-8 py-6 space-y-4">
          <p className="text-sm text-gray-600">
            You are signed in as an administrator. The admin portal opens in your browser.
          </p>
          <a
            href={targetUrl}
            target="_blank"
            rel="noreferrer"
            className="block w-full text-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            Open Admin Portal →
          </a>
          <button
            onClick={() => logout()}
            className="block w-full text-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

