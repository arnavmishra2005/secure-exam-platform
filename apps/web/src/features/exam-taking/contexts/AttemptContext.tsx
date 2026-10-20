/**
 * Owner: Person C (moved from apps/exam-client in Phase 4)
 *
 * The student's current attempt, shared by the instructions, exam and
 * submitted screens (ExamLayout mounts it).
 *
 *  1. The attemptId lives in sessionStorage so a reload resumes the attempt
 *     but another tab doesn't pick it up.
 *  2. `expiresAt` is always the server's. While the attempt runs, heartbeats
 *     (useServerClock) refresh it — so an admin's time extension shows up
 *     within one heartbeat — and give the server-time offset the timer uses.
 */

import { getAttempt, getMyExam } from '@secure-exam/api-client';
import { AttemptStatus } from '@secure-exam/types';
import type { Attempt, StudentExamView } from '@secure-exam/types';
import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useServerClock } from '../hooks/useServerClock';
import { startSync } from '../persistence';

export type AttemptExam = Pick<StudentExamView, 'examId' | 'title' | 'description' | 'durationMinutes'>;

export interface AttemptContextValue {
  attempt: Attempt | null;
  exam: AttemptExam | null;
  /** Server-authoritative expiry, including extensions. */
  expiresAt: string | null;
  /** Server time minus device time; the timer adds this to Date.now(). */
  serverOffsetMs: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  /**
   * Sets (or clears, with null) the active attempt. Always use this instead of
   * writing ATTEMPT_ID_KEY directly: the provider wouldn't see the change.
   */
  setAttemptId: (attemptId: string | null) => void;
}

const AttemptContext = createContext<AttemptContextValue | null>(null);

export const ATTEMPT_ID_KEY = 'exam_attempt_id';

/** Kept from Phase 2/3 for the hooks' tests: a client-only practice attempt. */
export const FIXTURE_ATTEMPT_ID = 'fixture-attempt-001';

export function isFixtureAttempt(attemptId: string | null | undefined): boolean {
  return attemptId === FIXTURE_ATTEMPT_ID;
}

function readStoredAttemptId(): string | null {
  try {
    return sessionStorage.getItem(ATTEMPT_ID_KEY);
  } catch {
    return null;
  }
}

export function AttemptProvider({ children }: { children: ReactNode }) {
  const [attemptId, setAttemptIdState] = useState(readStoredAttemptId);

  const setAttemptId = useCallback((id: string | null) => {
    try {
      if (id) sessionStorage.setItem(ATTEMPT_ID_KEY, id);
      else sessionStorage.removeItem(ATTEMPT_ID_KEY);
    } catch {
      // Private mode: the attempt can still be resumed from the dashboard.
    }
    setAttemptIdState(id);
  }, []);

  const attemptQuery = useQuery({
    queryKey: ['attempt', attemptId],
    queryFn: () => getAttempt(attemptId!),
    enabled: !!attemptId && !isFixtureAttempt(attemptId),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const attempt = attemptQuery.data ?? null;

  const examQuery = useQuery({
    queryKey: ['me', 'exams', attempt?.examId],
    queryFn: () => getMyExam(attempt!.examId),
    enabled: !!attempt,
    staleTime: 5 * 60_000,
  });

  const running = attempt?.status === AttemptStatus.IN_PROGRESS;
  const clock = useServerClock(running ? attempt.id : null);

  // Resume Person C's background sync: answers or a submission left unsynced
  // before a reload, or before the last sign-out.
  const loadedAttemptId = attempt?.id;
  useEffect(() => {
    if (loadedAttemptId) void startSync(loadedAttemptId);
  }, [loadedAttemptId]);

  // The server finalized the attempt (expiry sweep, or another tab submitted): reload it.
  const { refetch } = attemptQuery;
  useEffect(() => {
    if (clock && attempt && clock.status !== attempt.status) void refetch();
  }, [clock, attempt, refetch]);

  const value = useMemo<AttemptContextValue>(() => {
    const exam: AttemptExam | null = examQuery.data
      ? {
          examId: examQuery.data.examId,
          title: examQuery.data.title,
          description: examQuery.data.description,
          durationMinutes: examQuery.data.durationMinutes,
        }
      : null;
    return {
      attempt,
      exam,
      expiresAt: clock?.expiresAt ?? attempt?.expiresAt ?? null,
      serverOffsetMs: clock?.offsetMs ?? 0,
      // isPending, not isLoading: right after setAttemptId() the new query has
      // no data yet, and ExamPage must wait rather than treat it as missing.
      isLoading: !!attemptId && attemptQuery.isPending,
      error: (attemptQuery.error as Error | null) ?? null,
      refetch: () => void refetch(),
      setAttemptId,
    };
  }, [attempt, attemptId, attemptQuery.isPending, attemptQuery.error, clock, examQuery.data, refetch, setAttemptId]);

  return <AttemptContext.Provider value={value}>{children}</AttemptContext.Provider>;
}

export function useAttempt(): AttemptContextValue {
  const ctx = useContext(AttemptContext);
  if (!ctx) throw new Error('useAttempt must be used inside <AttemptProvider>');
  return ctx;
}
