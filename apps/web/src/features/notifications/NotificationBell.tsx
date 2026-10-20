// Owner: Person A
// Bell + dropdown of the signed-in user's in-app notifications.

import { listNotifications, markAllNotificationsRead, markNotificationRead } from '@secure-exam/api-client';
import type { Notification } from '@secure-exam/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

export const notificationsQueryKey = ['notifications'] as const;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: notificationsQueryKey,
    queryFn: () => listNotifications(20),
    refetchInterval: 60_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const markOne = useMutation({ mutationFn: markNotificationRead, onSuccess: invalidate });
  const markAll = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: invalidate });

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = data?.unreadCount ?? 0;

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-card text-card-foreground shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button className="text-xs text-primary hover:underline" onClick={() => markAll.mutate()}>
                Mark all read
              </button>
            )}
          </div>
          <NotificationList items={data?.items ?? []} onRead={(id) => markOne.mutate(id)} />
        </div>
      )}
    </div>
  );
}

export function NotificationList({
  items,
  onRead,
  className,
}: {
  items: Notification[];
  onRead?: (id: string) => void;
  className?: string;
}) {
  if (items.length === 0) {
    return <p className={cn('px-4 py-6 text-center text-sm text-muted-foreground', className)}>You're all caught up.</p>;
  }
  return (
    <ul className={cn('max-h-96 divide-y overflow-y-auto', className)}>
      {items.map((n) => (
        <li key={n.id}>
          <button
            type="button"
            onClick={() => !n.readAt && onRead?.(n.id)}
            className={cn('w-full px-4 py-3 text-left transition-colors hover:bg-muted/50', !n.readAt && 'bg-accent/40')}
          >
            <div className="flex items-start gap-2">
              {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
              <div className="min-w-0">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{formatRelative(n.createdAt)}</p>
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
