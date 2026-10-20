// Owner: Person A
// Header shell for student screens outside the exam itself.

import { GraduationCap, LogOut } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { studentNav } from '@/app/registry/nav';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { cn } from '@/lib/utils';

export function StudentLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-[hsl(var(--warning))]" aria-hidden="true" />
              <span className="font-serif text-lg">Examination Register</span>
            </div>
            <nav className="hidden items-center gap-1 sm:flex" aria-label="Student">
              {studentNav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'rounded-md px-3 py-1.5 text-sm transition-colors',
                      isActive ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/75 hover:text-sidebar-foreground',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <span className="hidden max-w-[180px] truncate text-sm text-sidebar-foreground/80 md:inline">{user?.fullName}</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
              onClick={async () => {
                await logout();
                navigate('/login', { replace: true });
              }}
            >
              <LogOut /> <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
