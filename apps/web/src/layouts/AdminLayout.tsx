// Owner: Person A
// Sidebar shell for every admin screen. Navigation comes from the nav registry.

import { GraduationCap, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { adminNav } from '@/app/registry/nav';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background lg:flex">
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b bg-sidebar px-4 py-3 text-sidebar-foreground lg:hidden">
        <Brand />
        <Button
          variant="ghost"
          size="icon"
          className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X /> : <Menu />}
        </Button>
      </div>

      <aside
        className={cn(
          'flex-col justify-between bg-sidebar px-4 py-6 text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0',
          mobileOpen ? 'flex' : 'hidden',
        )}
      >
        <div>
          <div className="hidden px-2 lg:block">
            <Brand />
          </div>
          <nav className="mt-2 flex flex-col gap-1 lg:mt-8" aria-label="Admin">
            {adminNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive ? 'bg-primary text-primary-foreground' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent',
                  )
                }
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <UserBlock />
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:py-8">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <GraduationCap className="h-5 w-5 text-[hsl(var(--warning))]" aria-hidden="true" />
      <span className="font-serif text-lg leading-tight">Examination Register</span>
    </div>
  );
}

function UserBlock() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="mt-6 border-t border-sidebar-foreground/15 pt-4">
      <p className="truncate text-sm">{user?.fullName}</p>
      <p className="truncate text-xs text-sidebar-foreground/60">{user?.email}</p>
      <button
        type="button"
        onClick={async () => {
          await logout();
          navigate('/login', { replace: true });
        }}
        className="mt-3 inline-flex items-center gap-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
      </button>
    </div>
  );
}
