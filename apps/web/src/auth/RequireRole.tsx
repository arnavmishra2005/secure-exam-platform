// Owner: Person A
// Route guard: signed out -> /login (remembering where they were going);
// wrong role -> their own home.

import { Role } from '@secure-exam/types';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { FullPageSpinner } from '@/components/ui/spinner';
import { homePathFor, useAuth } from './AuthContext';

export function RequireRole({ role }: { role: Role }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageSpinner label="Restoring your session" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (user.role !== role) return <Navigate to={homePathFor(user.role)} replace />;
  return <Outlet />;
}
