// Owner: Person A (Identity/Auth/Security)
// Route folders under here map 1:1 to owners: /students -> A, /exams and
// /questions -> B, /monitoring /audit /results -> C. This shell renders all
// of them; B and C add their own nav entries additively when their screens
// land.

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/auth-context';

const NAV_ITEMS = [
  { href: '/students', label: 'Students', owner: 'A' },
  { href: '/exams', label: 'Exams', owner: 'B' },
  { href: '/questions', label: 'Question bank', owner: 'B' },
  { href: '/monitoring', label: 'Live monitoring', owner: 'C' },
  { href: '/audit', label: 'Audit log', owner: 'C' },
  { href: '/results', label: 'Results', owner: 'C' },
];

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="flex min-h-screen bg-paper">
        <Sidebar />
        <main className="flex-1 px-10 py-8">{children}</main>
      </div>
    </ProtectedRoute>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="flex w-64 shrink-0 flex-col justify-between bg-ink px-6 py-8 text-paper">
      <div>
        <p className="font-serif text-lg leading-tight text-paper">Examination Register</p>
        <nav className="mt-8 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between rounded px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-verdigris text-white'
                    : 'text-paper/80 hover:bg-ink-light'
                }`}
              >
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-paper/15 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-paper">{user?.fullName ?? user?.email}</p>
            <Badge tone="gold">{user?.role}</Badge>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="mt-4 text-sm text-paper/60 underline-offset-2 hover:text-paper hover:underline"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
