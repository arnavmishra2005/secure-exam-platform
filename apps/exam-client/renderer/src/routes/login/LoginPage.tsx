/**
 * Owner: Person A — App Shell, Auth, Session & Timer
 *
 * Unified login page (TEMPORARY — ponytail: replace when Person A/B deliver polished shell).
 * Handles both STUDENT and ADMIN roles from a single form.
 * Post-login: ADMIN → admin portal (VITE_ADMIN_URL), STUDENT → /instructions.
 */

import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

// ponytail: hardcoded fallback; swap for env-driven config when Electron main passes it
const ADMIN_URL = import.meta.env.VITE_ADMIN_URL ?? 'http://localhost:3001';

const ROLE_PRESETS = [
  { label: 'Student (Alice)', email: 'alice@secure-exam.dev', password: 'Student@1234' },
  { label: 'Student (Bob)', email: 'bob@secure-exam.dev', password: 'Student@1234' },
  { label: 'Admin', email: 'admin@secure-exam.dev', password: 'Admin@1234' },
  { label: 'Custom', email: '', password: '' },
];

function destForRole(role?: string): string {
  if (role?.toLowerCase() === 'admin') return '/admin-redirect';
  return '/instructions';
}

export default function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const [selectedPreset, setSelectedPreset] = useState(ROLE_PRESETS[0].label);
  const [email, setEmail] = useState(ROLE_PRESETS[0].email);
  const [password, setPassword] = useState(ROLE_PRESETS[0].password);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Wait for session restoration so a restored user isn't shown the form.
  if (isLoading) return null;

  // Already signed in: route by role.
  if (user && !isSubmitting) {
    return <Navigate to={destForRole(user.role)} replace />;
  }

  function handlePresetChange(label: string) {
    setSelectedPreset(label);
    const found = ROLE_PRESETS.find((p) => p.label === label);
    if (found && label !== 'Custom') {
      setEmail(found.email);
      setPassword(found.password);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ email, password });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Invalid email or password.';
      setError(Array.isArray(msg) ? msg.join(', ') : String(msg));
      setIsSubmitting(false);
      return;
    }

    const refreshToken = localStorage.getItem('exam_refresh_token') ?? '';
    let role = 'student';
    try {
      const payload = JSON.parse(atob(refreshToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      role = payload.role ?? 'student';
    } catch { /* keep student default */ }

    setIsSubmitting(false);
    if (role?.toLowerCase() === 'admin') {
      window.location.href = `${ADMIN_URL}/students?refreshToken=${encodeURIComponent(refreshToken)}`;
    } else {
      navigate('/instructions', { replace: true });
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Header band */}
          <div className="bg-blue-600 px-8 py-6">
            <h1 className="text-xl font-bold text-white">Secure Exam Portal</h1>
            <p className="text-blue-200 text-sm mt-1">Sign in with your institutional credentials</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5" noValidate>
            {error && (
              <div
                className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3"
                role="alert"
              >
                {error}
              </div>
            )}

            <div className="space-y-1">
              <label htmlFor="role-preset" className="block text-sm font-medium text-gray-700">
                Login as
              </label>
              <select
                id="role-preset"
                value={selectedPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {ROLE_PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="student@example.com"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Use the credentials provided by your institution.
        </p>
      </div>
    </div>
  );
}

