/**
 * Owner: Person A — App Shell, Auth, Session & Timer
 *
 * Renders the network status badge in the Header.
 * The actual detection logic lives in Person C's hooks: useNetworkStatus()
 * (navigator.onLine plus a backend ping) and useSyncStatus(). This component
 * is just the display layer — zero logic of its own.
 */

import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useSyncStatus } from '../../hooks/useSyncStatus';

interface NetworkStatusBadgeProps {
  className?: string;
}

export function NetworkStatusBadge({ className }: NetworkStatusBadgeProps) {
  const online = useNetworkStatus() === 'online';
  const syncing = useSyncStatus((s) => s.syncing);
  const pendingCount = useSyncStatus((s) => Object.values(s.answers).filter((st) => st === 'pending').length);

  if (online && !syncing) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 ${className ?? ''}`}
        role="status"
        aria-label="Connected"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
        Connected
      </span>
    );
  }

  if (syncing) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5 ${className ?? ''}`}
        role="status"
        aria-label="Syncing"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
        Syncing…
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 ${className ?? ''}`}
      role="status"
      aria-label="Offline — answers saved locally"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
      Offline — saving locally{pendingCount > 0 ? ` (${pendingCount} pending)` : ''}
    </span>
  );
}

