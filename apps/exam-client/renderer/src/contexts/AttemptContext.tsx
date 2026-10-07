/**
 * Owner: Person A — App Shell, Auth, Session & Timer
 *
 * AttemptContext bootstraps the current exam attempt on load.
 * It fetches exam metadata + `expires_at` from Phase 1's attempt.api
 * (built by Person C in Phase 1) and makes it available to:
 *   - TimerDisplay (Person A) — for countdown seeding
 *   - ExamPage (Person B) — for question list + exam metadata
 *   - Header (Person A) — for exam title
 *
 * Design rules:
 *   1. The attemptId is stored in sessionStorage (cleared when tab closes)
 *      so it survives page reloads within the same session but not
 *      cross-tab reuse.
 *   2. The `expiresAt` timestamp comes from the SERVER — never from
 *      the client clock. The timer re-seeds on every re-fetch/reconnect
 *      so client drift never accumulates.
 *   3. This context acts as a stub-friendly boundary: on Day 0/1 before
 *      a real attempt exists, the fixture data in FIXTURE_ATTEMPT below
 *      is used so Person B can develop ExamPage without waiting for a
 *      live backend.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAttempt } from '@secure-exam/api-client';
import type { Attempt, Exam } from '@secure-exam/types';
import { startSync } from '../persistence';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AttemptContextValue {
  attempt: Attempt | null;
  /** Exam metadata fetched alongside the attempt. */
  exam: Exam | null;
  /** Convenience: ISO 8601 string from the server (never computed client-side). */
  expiresAt: string | null;
  isLoading: boolean;
  error: Error | null;
  /** Trigger a manual re-fetch (e.g. after reconnect) to re-seed the timer. */
  refetch: () => void;
  /**
   * Sets (or clears, with null) the active attempt. Always use this instead of
   * writing ATTEMPT_ID_KEY to sessionStorage directly: the provider doesn't
   * re-render on navigation, so it would keep the old ID until a page reload.
   */
  setAttemptId: (attemptId: string | null) => void;
}

// ── Context ────────────────────────────────────────────────────────────────

const AttemptContext = createContext<AttemptContextValue | null>(null);

// Key used to persist the active attemptId across page reloads within a session.
export const ATTEMPT_ID_KEY = 'exam_attempt_id';

// ── Fixture data (stub) — used when VITE_USE_FIXTURE=true ─────────────────
// Remove or ignore once a real attempt is available from the backend.

const IS_FIXTURE = import.meta.env.VITE_USE_FIXTURE === 'true';

/** The demo attempt started from InstructionsPage. It doesn't exist on the server. */
export const FIXTURE_ATTEMPT_ID = 'fixture-attempt-001';

export function isFixtureAttempt(attemptId: string | null | undefined): boolean {
  return IS_FIXTURE || attemptId === FIXTURE_ATTEMPT_ID;
}

const FIXTURE_ATTEMPT: Attempt = {
  id: FIXTURE_ATTEMPT_ID,
  examId: 'fixture-exam-001',
  studentId: 'fixture-student-001',
  status: 'IN_PROGRESS' as Attempt['status'],
  startedAt: new Date().toISOString(),
  // 90 minutes from now — gives Person B enough time to work on ExamPage locally
  expiresAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
  submittedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const FIXTURE_EXAM: Exam = {
  id: 'fixture-exam-001',
  title: 'Sample Exam (Fixture)',
  description: 'This is fixture data — replace with a real exam from the backend.',
  durationMinutes: 90,
  startTime: new Date().toISOString(),
  endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  status: 'ACTIVE' as Exam['status'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ── Provider ───────────────────────────────────────────────────────────────

/**
 * AttemptProvider is used as a layout route element in App.tsx so it wraps
 * /instructions, /exam, and /submitted without adding extra DOM nesting.
 * Renders <Outlet /> to pass children through.
 */
export function AttemptProvider({ children }: { children?: ReactNode }) {
  const [attemptId, setAttemptIdState] = useState(() => sessionStorage.getItem(ATTEMPT_ID_KEY));

  const setAttemptId = useCallback((id: string | null) => {
    if (id) sessionStorage.setItem(ATTEMPT_ID_KEY, id);
    else sessionStorage.removeItem(ATTEMPT_ID_KEY);
    setAttemptIdState(id);
  }, []);

  const {
    data,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['attempt', attemptId],
    queryFn: async () => {
      if (!attemptId) return null;
      // The /attempts/:id endpoint returns Attempt; exam metadata is embedded.
      const attempt = await getAttempt(attemptId);
      return attempt;
    },
    enabled: !!attemptId && !isFixtureAttempt(attemptId),
    // Re-fetch every 60 seconds to keep expiresAt in sync with the server.
    refetchInterval: 60_000,
    // Re-fetch when the window regains focus (covers tab-switch reconnect).
    refetchOnWindowFocus: true,
  });

  // Resume Person C's background sync for this attempt: answers or a submission
  // left unsynced before a reload, or before the last logout.
  const loadedAttemptId = data?.id;
  useEffect(() => {
    if (loadedAttemptId && !isFixtureAttempt(loadedAttemptId)) void startSync(loadedAttemptId);
  }, [loadedAttemptId]);

  const value = useMemo<AttemptContextValue>(() => {
    if (!attemptId) {
      return {
        attempt: null,
        exam: null,
        expiresAt: null,
        isLoading: false,
        error: null,
        refetch: () => {},
        setAttemptId,
      };
    }

    if (isFixtureAttempt(attemptId)) {
      return {
        attempt: FIXTURE_ATTEMPT,
        exam: FIXTURE_EXAM,
        expiresAt: FIXTURE_ATTEMPT.expiresAt,
        isLoading: false,
        error: null,
        refetch: () => {},
        setAttemptId,
      };
    }

    const attempt = data ?? null;
    return {
      attempt,
      // Note: Phase 1's GET /attempts/:id does not embed full Exam yet.
      // Person B's exam data is fetched separately in useExamQuestions.ts.
      // exam here is null until Person B's hook populates it separately.
      exam: null,
      expiresAt: attempt?.expiresAt ?? null,
      // isPending, not isLoading: right after setAttemptId() the query for the new
      // ID has no data yet, and consumers (ExamPage) must wait rather than treat
      // the attempt as missing and redirect away.
      isLoading: isPending,
      error: error as Error | null,
      refetch,
      setAttemptId,
    };
  }, [attemptId, data, isPending, error, refetch, setAttemptId]);

  return (
    <AttemptContext.Provider value={value}>
      {children ?? <Outlet />}
    </AttemptContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useAttempt(): AttemptContextValue {
  const ctx = useContext(AttemptContext);
  if (!ctx) throw new Error('useAttempt must be used inside <AttemptProvider>');
  return ctx;
}
