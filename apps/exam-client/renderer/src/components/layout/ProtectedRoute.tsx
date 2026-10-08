/**
 * Owner: Person A — App Shell, Auth, Session & Timer
 *
 * Wraps routes that require an authenticated student.
 * Redirects to /login if the user is not authenticated.
 * Shows a loading spinner while session restoration is in progress
 * (prevents a flash of redirect on page reload with a valid refresh token).
 */

import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export function ProtectedRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-500 text-sm">Restoring session…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

