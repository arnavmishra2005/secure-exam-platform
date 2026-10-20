/**
 * Violation banner — shown in ExamPage when a security event is received.
 * Invigilator exit dialog with PIN protection.
 * Temporary: Person A/B will restyle when the unified UI kit lands.
 */
import { useState, useEffect } from 'react';
import { useDesktopSecurityEvents, isDesktop, desktop } from '../../hooks/useDesktop';
import type { SecurityEvent } from '../../hooks/useDesktop';

const BENIGN: string[] = ['FOCUS_REGAINED'];

function label(event: SecurityEvent): string {
  const map: Record<string, string> = {
    FOCUS_LOST: 'Focus lost: you navigated away from the exam window. This event has been recorded.',
    DISPLAY_CHANGED: 'External display detected. Disconnect it to continue.',
    BLOCKED_SHORTCUT: 'Unauthorized shortcut blocked.',
    DEVTOOLS_ATTEMPT: 'Developer tools access attempt was blocked.',
    NAV_BLOCKED: 'Navigation to an external URL was blocked.',
    KIOSK_CHECK_FAILED: 'Kiosk readiness check failed.',
    HEARTBEAT_LOST: 'Connection to the exam server was lost.',
  };
  return event.detail ?? map[event.type] ?? `Security event: ${event.type}`;
}

export function ViolationBanner() {
  const [last, setLast] = useState<SecurityEvent | null>(null);
  const [showExit, setShowExit] = useState(false);
  const [pin, setPin] = useState('');
  const [exitMsg, setExitMsg] = useState('');

  useDesktopSecurityEvents((event) => {
    if (event.type === 'FOCUS_LOST') {
      setLast({
        type: 'FOCUS_LOST',
        detail: 'Focus lost: you navigated away from the exam window. This event has been recorded.',
        ts: Date.now(),
      });
    } else if (event.type === 'FOCUS_REGAINED') {
      // Keep any existing FOCUS_LOST warning active so the student sees it when returning
    } else if (!BENIGN.includes(event.type)) {
      setLast(event);
    }
  });

  // Auto-dismiss shortcuts / info events after 8 seconds, but keep focus-loss visible until dismissed
  useEffect(() => {
    if (!last || last.type === 'FOCUS_LOST') return;
    const t = setTimeout(() => setLast(null), 8000);
    return () => clearTimeout(t);
  }, [last]);

  if (!isDesktop()) return null;

  async function handleExit() {
    const result = await desktop.exitKiosk(pin);
    if (!result.ok) setExitMsg(result.reason ?? 'Incorrect PIN.');
  }

  return (
    <>
      {last && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-sm px-4 py-2 flex items-center justify-between shadow-lg">
          <span>⚠ {label(last)}</span>
          <button onClick={() => setLast(null)} className="ml-4 text-white underline text-xs font-semibold hover:text-red-100">Dismiss</button>
        </div>
      )}

      {/* Invigilator exit button — visible in kiosk */}
      <button
        onClick={() => setShowExit(true)}
        className="fixed bottom-2 right-2 z-50 text-xs bg-gray-800 text-gray-200 px-2.5 py-1 rounded shadow-md opacity-60 hover:opacity-100 transition-opacity"
        title="Invigilator Exit"
      >
        Exit Kiosk
      </button>

      {showExit && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 w-80 space-y-4">
            <h2 className="text-base font-semibold text-gray-800">Invigilator Exit</h2>
            <p className="text-sm text-gray-600">Enter the invigilator PIN to close the kiosk.</p>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            {exitMsg && <p className="text-xs text-red-600">{exitMsg}</p>}
            <div className="flex gap-3">
              <button onClick={handleExit} className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-semibold">Exit</button>
              <button onClick={() => { setShowExit(false); setPin(''); setExitMsg(''); }} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

