/**
 * Owner: Person A — App Shell, Auth, Session & Timer
 *
 * Student login page.
 * Reuses the same /auth/login endpoint and JWT shape built in Phase 1
 * (Person A there) — only the role in the JWT payload differs (STUDENT vs ADMIN).
 *
 * After successful login, stores the attemptId from the URL query param
 * (if present — used when a student follows a deep link) or redirects
 * to /instructions for the standard flow.
 */

import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Wait for session restoration so a restored student isn't shown the form.
  if (isLoading) return null;

  // Already signed in (restored from the stored refresh token): send them to the
  // instructions page, which shows who is signed in and offers "Sign out".
  // Logging in over a live session would leave the old one active.
  if (user && !isSubmitting) return <Navigate to="/instructions" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ email, password });
      navigate('/instructions', { replace: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Invalid email or password.';
      setError(Array.isArray(msg) ? msg.join(', ') : String(msg));
    } finally {
      setIsSubmitting(false);
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
            <p className="text-blue-200 text-sm mt-1">Sign in with your student credentials</p>
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

