// Owner: Person A
// The single sign-in page for admins and students. Where you land depends on
// the role in your account, not on which page you used.

import { GraduationCap } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { homePathFor, useAuth } from '@/auth/AuthContext';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { FullPageSpinner } from '@/components/ui/spinner';
import { getErrorMessage, getErrorStatus } from '@/lib/errors';

export default function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return <FullPageSpinner label="Restoring your session" />;
  if (user && !submitting) return <Navigate to={homePathFor(user.role)} replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const signedIn = await login(email.trim(), password);
      // Go back to the page that sent them here, if it belongs to their role.
      const from = (location.state as { from?: string } | null)?.from;
      const home = homePathFor(signedIn.role);
      const sameArea = from && from.split('/')[1] === home.split('/')[1];
      navigate(sameArea ? from : home, { replace: true });
    } catch (err) {
      const status = getErrorStatus(err);
      setError(
        status === 401
          ? 'Incorrect email or password.'
          : status === 429
            ? 'Too many attempts. Wait a minute and try again.'
            : getErrorMessage(err, 'Could not sign in. Please try again.'),
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-[hsl(var(--warning))]" aria-hidden="true" />
          <span className="font-serif text-xl">Examination Register</span>
        </div>
        <div className="max-w-md">
          <p className="font-serif text-3xl leading-snug">Secure, timed examinations for your institution.</p>
          <p className="mt-4 text-sm text-sidebar-foreground/70">
            Staff manage courses, exams and results here. Students see their exams, sit them, and check published results.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">Every sign-in is recorded in the audit log.</p>
      </div>

      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-primary" aria-hidden="true" />
              <span className="font-serif text-xl">Examination Register</span>
            </div>
          </div>
          <h1 className="font-serif text-2xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Students and staff use the same sign-in.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            {error && <Alert variant="destructive">{error}</Alert>}
            <Field label="Email">
              <Input
                type="email"
                autoComplete="username"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@college.edu"
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" className="w-full" loading={submitting} disabled={!email || !password}>
              Sign in
            </Button>
          </form>
          <p className="mt-6 text-xs text-muted-foreground">Use the credentials provided by your institution.</p>
        </div>
      </div>
    </div>
  );
}
