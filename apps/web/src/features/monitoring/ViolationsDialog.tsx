/**
 * Owner: Person C (Electron, Kiosk & Security)
 * The violation count on the monitoring and results screens; click it to see
 * each event the exam app recorded for that attempt.
 */

import { getAttemptSecurityEvents } from '@secure-exam/api-client';
import type { DesktopViolationType } from '@secure-exam/types';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const LABELS: Record<DesktopViolationType, string> = {
  FOCUS_LOST: 'Left the exam window',
  FOCUS_REGAINED: 'Came back to the exam window',
  DISPLAY_CHANGED: 'Display connected or removed',
  BLOCKED_SHORTCUT: 'Pressed a blocked key combination',
  DEVTOOLS_ATTEMPT: 'Tried to open developer tools',
  NAV_BLOCKED: 'Tried to navigate away',
  CLIPBOARD_BLOCKED: 'Pasted from outside the editor',
  KIOSK_CHECK_FAILED: 'Kiosk check failed',
  HEARTBEAT_LOST: 'Lost connection to the server',
};

// Informational: shown, but they do not count towards the total.
const INFORMATIONAL = new Set<DesktopViolationType>(['FOCUS_REGAINED', 'HEARTBEAT_LOST']);

export function ViolationsButton({
  attemptId,
  count,
  studentName,
}: {
  attemptId: string | null;
  count: number | null;
  studentName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (!attemptId || count === null) return <span className="text-muted-foreground">—</span>;
  if (count === 0) return <span className="text-muted-foreground">0</span>;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('font-semibold tabular-nums underline underline-offset-2 hover:text-foreground', count >= 5 ? 'text-destructive' : 'text-warning')}
        title="See what was recorded"
      >
        {count}
      </button>
      <ViolationsDialog attemptId={attemptId} studentName={studentName} open={open} onOpenChange={setOpen} />
    </>
  );
}

function ViolationsDialog({
  attemptId,
  studentName,
  open,
  onOpenChange,
}: {
  attemptId: string;
  studentName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const events = useQuery({
    queryKey: ['attempts', attemptId, 'security-events'],
    queryFn: () => getAttemptSecurityEvents(attemptId),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Recorded activity{studentName ? `: ${studentName}` : ''}</DialogTitle>
          <DialogDescription>
            Reported by the exam app during the attempt. Times are the student’s device clock.
          </DialogDescription>
        </DialogHeader>
        {events.error ? (
          <Alert variant="destructive">{getErrorMessage(events.error)}</Alert>
        ) : events.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : events.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded.</p>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.data.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(e.occurredAt)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        {LABELS[e.type] ?? e.type}
                        {INFORMATIONAL.has(e.type) && <Badge variant="outline">info</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{e.detail ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
