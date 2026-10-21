// Owner: Person C (ported from the legacy exam client).
// Shows security events from the exam app and the invigilator exit dialog.
// Renders nothing in a plain browser.

import type { DesktopSecurityEvent } from '@secure-exam/types';
import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { desktop, isDesktop, useDesktopSecurityEvents } from './desktop';

const MESSAGES: Record<string, string> = {
  FOCUS_LOST: 'You left the exam window. This has been recorded.',
  DISPLAY_CHANGED: 'A display change was detected. Disconnect any external display to continue.',
  BLOCKED_SHORTCUT: 'That shortcut is not allowed during the exam.',
  DEVTOOLS_ATTEMPT: 'Developer tools are blocked during the exam.',
  NAV_BLOCKED: 'Navigation to an external address was blocked.',
  CLIPBOARD_BLOCKED: 'Pasting text from outside the code editor is blocked.',
  KIOSK_CHECK_FAILED: 'A kiosk readiness check failed.',
  HEARTBEAT_LOST: 'The connection to the exam server was lost.',
};

export function ViolationBanner() {
  const [last, setLast] = useState<DesktopSecurityEvent | null>(null);
  const [showExit, setShowExit] = useState(false);
  const [pin, setPin] = useState('');
  const [exitMessage, setExitMessage] = useState('');

  useDesktopSecurityEvents((event) => {
    // Regaining focus must not hide the earlier "focus lost" warning.
    if (event.type !== 'FOCUS_REGAINED') setLast(event);
  });

  // Everything except a focus loss clears itself; a focus loss stays until dismissed.
  useEffect(() => {
    if (!last || last.type === 'FOCUS_LOST') return;
    const timer = setTimeout(() => setLast(null), 8000);
    return () => clearTimeout(timer);
  }, [last]);

  const { pathname } = useLocation();
  // Once the exam is over there is nothing to warn about and the page has its own Close button.
  if (!isDesktop() || pathname.endsWith('/submitted')) return null;

  async function handleExit() {
    const result = await desktop.exitKiosk(pin);
    if (!result.ok) setExitMessage(result.reason ?? 'Incorrect PIN.');
  }

  function closeExit() {
    setShowExit(false);
    setPin('');
    setExitMessage('');
  }

  return (
    <>
      {last && (
        <div
          role="alert"
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-4 bg-destructive px-4 py-2 text-sm text-destructive-foreground shadow-lg"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {last.detail && last.type !== 'FOCUS_LOST' ? last.detail : (MESSAGES[last.type] ?? `Security event: ${last.type}`)}
          </span>
          <button type="button" className="text-xs font-semibold underline" onClick={() => setLast(null)}>
            Dismiss
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowExit(true)}
        title="Invigilator exit"
        className="fixed bottom-2 right-2 z-50 rounded bg-foreground/80 px-2.5 py-1 text-xs text-background opacity-60 shadow-md transition-opacity hover:opacity-100"
      >
        Exit exam app
      </button>

      {showExit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-80 space-y-4 rounded-xl bg-card p-6 text-card-foreground">
            <h2 className="text-base font-semibold">Invigilator exit</h2>
            <p className="text-sm text-muted-foreground">Enter the invigilator PIN to close the exam app.</p>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
              autoFocus
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            {exitMessage && <p className="text-xs text-destructive">{exitMessage}</p>}
            <div className="flex gap-3">
              <Button variant="destructive" className="flex-1" onClick={() => void handleExit()}>
                Exit
              </Button>
              <Button variant="outline" className="flex-1" onClick={closeExit}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
