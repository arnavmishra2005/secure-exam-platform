/**
 * Owner: Person A — App Shell, Auth, Session & Timer
 *
 * Instructions page — shown between login and the exam.
 * Responsibilities:
 *   1. Display exam rules / general instructions.
 *   2. Call POST /attempts to create (start) the attempt when the student
 *      clicks "Start Exam", store the returned attemptId in sessionStorage
 *      (via AttemptContext's setAttemptId), then navigate to /exam.
 *   3. Show exam metadata (title, duration) from AttemptContext.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyAttemptForExam, startAttempt } from '@secure-exam/api-client';
import { AttemptStatus } from '@secure-exam/types';
import { useAttempt, FIXTURE_ATTEMPT_ID } from '../../contexts/AttemptContext';
import { useAuth } from '../../hooks/useAuth';

/** General exam instructions shown to every student. */
const INSTRUCTIONS = [
  'Read each question carefully before selecting an answer.',
  'You can mark questions for review and revisit them using the question palette.',
  'Do not refresh or close the browser window during the exam.',
  'Your answers are saved automatically. A sync indicator shows the current save status.',
  'Submit your exam before the timer reaches zero. The system will auto-submit on expiry.',
  'Keep your screen visible. Any violation will be recorded in the audit log.',
];

/** The API's 403 message when the logged-in student isn't assigned to the exam. */
const NOT_ASSIGNED_MESSAGE = 'You are not assigned to this exam';

interface StartError {
  message: string;
  /** How many times in a row this same message was shown, so a repeat is visible. */
  count: number;
}

export default function InstructionsPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { attempt, exam, isLoading, setAttemptId } = useAttempt();
  const [examId, setExamId] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [error, setErrorState] = useState<StartError | null>(null);

  function setError(message: string | null) {
    setErrorState((prev) =>
      message === null
        ? null
        : { message, count: prev?.message === message ? prev.count + 1 : 1 },
    );
  }

  async function handleSignOut() {
    // The stored attempt belongs to this student; don't let the next one pick it up.
    setAttemptId(null);
    await logout();
    navigate('/login', { replace: true });
  }

  // If an attempt is already active in sessionStorage (session restore), navigate to exam
  useEffect(() => {
    if (!isLoading && attempt?.status === 'IN_PROGRESS') {
      navigate('/exam', { replace: true });
    }
  }, [isLoading, attempt?.status, navigate]);

  async function handleStart(customExamId?: string) {
    const idToUse = (customExamId || examId).trim();
    if (!idToUse) {
      setError('Please enter your Exam ID.');
      return;
    }
    // The previous error stays up until this try resolves, so an identical error
    // bumps its repeat count instead of silently re-rendering the same text.
    setIsStarting(true);
    try {
      if (idToUse === 'demo' || idToUse === 'fixture-exam-001') {
        setAttemptId(FIXTURE_ATTEMPT_ID);
        navigate('/exam', { replace: true });
        return;
      }
      const newAttempt = await startAttempt({ examId: idToUse });
      setAttemptId(newAttempt.id);
      navigate('/exam', { replace: true });
    } catch (err: unknown) {
      // 409: this student already has an attempt (e.g. started in another tab, whose
      // attempt ID this tab never saw). Resume it if it's still running.
      if ((err as { response?: { status?: number } })?.response?.status === 409) {
        try {
          const existing = await getMyAttemptForExam(idToUse);
          if (existing.status === AttemptStatus.IN_PROGRESS) {
            setAttemptId(existing.id);
            navigate('/exam', { replace: true });
            return;
          }
          setError('You have already submitted this exam.');
          return;
        } catch (lookupErr) {
          console.error('Failed to look up the existing attempt:', lookupErr);
        }
      }
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Unable to start exam. Please contact your invigilator.';
      console.error('Failed to start attempt:', msg, err);
      const text = Array.isArray(msg) ? msg.join(', ') : String(msg);
      setError(
        text === NOT_ASSIGNED_MESSAGE
          ? `${user?.email ?? 'This account'} is not assigned to this exam. Check the Exam ID, or sign out and sign in as the assigned student.`
          : text,
      );
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        {/* Exam info card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
          <div className="bg-blue-600 px-8 py-5">
            <h1 className="text-lg font-bold text-white">
              {exam?.title ?? 'Exam Instructions'}
            </h1>
            {exam && (
              <p className="text-blue-200 text-sm mt-1">
                Duration: {exam.durationMinutes} minutes
              </p>
            )}
          </div>

          <div className="px-8 py-6">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 mb-5">
              <div className="min-w-0">
                <p className="text-xs text-gray-500">Signed in as</p>
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {user?.fullName ?? user?.email}
                </p>
                {user?.fullName && user.fullName !== user.email && (
                  <p className="text-xs text-gray-600 truncate">{user.email}</p>
                )}
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isStarting}
                className="flex-shrink-0 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-60"
              >
                Not you? Sign out
              </button>
            </div>

            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              General Instructions
            </h2>
            <ul className="space-y-2">
              {INSTRUCTIONS.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Start exam form */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-8 py-6">
          <p className="text-sm text-gray-700 mb-4">
            Enter the <strong>Exam ID</strong> provided by your invigilator to begin.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4" role="alert">
              {error.message}
              {error.count > 1 && (
                <span className="ml-2 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold">
                  ×{error.count}
                </span>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <input
              type="text"
              value={examId}
              onChange={(e) => setExamId(e.target.value)}
              placeholder="e.g. 11111111-1111-4111-8111-111111111111"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
              aria-label="Exam ID"
            />
            <button
              onClick={() => handleStart()}
              disabled={isStarting}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {isStarting ? 'Starting…' : 'Start Exam'}
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-500">Want to test without an active backend exam ID?</span>
            <button
              type="button"
              onClick={() => handleStart('demo')}
              disabled={isStarting}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
            >
              Start Demo Exam &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
