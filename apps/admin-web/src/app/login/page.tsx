// Owner: Person A (Identity/Auth/Security)

'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { useAuth } from '@/contexts/auth-context';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      router.push('/students');
    } catch {
      setError('That email and password combination was not recognized.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[1.1fr_1fr]">
      {/* Register panel — the characteristic thing in this subject's world: a
          ledger heading with a docket number, not a marketing hero. */}
      <div className="hidden flex-col justify-between bg-ink px-16 py-14 text-paper md:flex">
        <div>
          <p className="font-sans text-xs tracking-wide text-paper/60">Docket No. SE-2026-001</p>
          <h1 className="mt-6 max-w-md font-serif text-4xl leading-tight text-paper">
            The examination register
          </h1>
          <p className="mt-4 max-w-sm font-sans text-sm leading-relaxed text-paper/70">
            Every login, every record change, every attempt is entered here
            and cannot be quietly removed.
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-8 border-t border-paper/15 pt-6 font-sans text-sm">
          <div>
            <dt className="text-paper/50">Access</dt>
            <dd className="mt-1 tabular-nums text-paper">Role-based</dd>
          </div>
          <div>
            <dt className="text-paper/50">Timing</dt>
            <dd className="mt-1 tabular-nums text-paper">Server-authoritative</dd>
          </div>
          <div>
            <dt className="text-paper/50">Trail</dt>
            <dd className="mt-1 tabular-nums text-paper">Immutable</dd>
          </div>
        </dl>
      </div>

      {/* Sign-in panel */}
      <div className="flex items-center justify-center bg-paper px-6 py-14">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <h2 className="font-serif text-2xl text-ink">Sign in</h2>
          <p className="mt-1 text-sm text-ash-muted">
            Administrator access to the examination console.
          </p>

          <div className="mt-8 flex flex-col gap-4">
            <Field
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Field
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded border border-brick/30 bg-brick-light px-3 py-2 text-sm text-brick">
              {error}
            </p>
          )}

          <Button type="submit" isLoading={isSubmitting} className="mt-6 w-full">
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
