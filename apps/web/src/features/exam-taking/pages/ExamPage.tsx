/**
 * Owner: Person B — Exam-Taking UI
 * Container screen for the active exam-taking interface.
 *
 * Integrated with:
 *  - Person A: Header, TimerDisplay, useAttempt (session & expiresAt), routing (/submitted)
 *  - Person B: QuestionRenderer, OptionList, QuestionPalette, NavigationControls, SubmitConfirmationModal, useExamStore
 *  - Person C: answers saved through useAnswer (C's saveAnswer()), submission through
 *    C's requestSubmit(), and sync state through useSyncStatus()
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AttemptStatus, QuestionType } from '@secure-exam/types';
import { getLatestCodeSubmissions, sendHeartbeat } from '@secure-exam/api-client';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/error-state';
import { isSessionMoved, onSessionEvent } from '@/auth/session';
import { getErrorMessage } from '@/lib/errors';
import { useAttempt } from '../contexts/AttemptContext';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { useExamQuestions } from '../hooks/useExamQuestions';
import { useExamStore } from '../store/examStore';
import { useQuestionNavigation } from '../hooks/useQuestionNavigation';
import { useAnswer } from '../hooks/useAnswer';
import { Header } from '../components/Header';
import { questionRenderers } from '../questionRenderers.registry';
import { QuestionPalette } from '../components/QuestionPalette';
import { NavigationControls } from '../components/NavigationControls';
import { SubmitConfirmationModal } from '../components/SubmitConfirmationModal';
import { isFixtureAttempt } from '../contexts/AttemptContext';
import { requestSubmit } from '../persistence';
import { desktop } from '../desktop/desktop';
import { useSecurityReporter } from '../security/useSecurityReporter';

export default function ExamPage() {
  const navigate = useNavigate();
  const { attempt, exam, isLoading: isAttemptLoading, error: attemptError, refetch: retryAttempt } = useAttempt();
  const attemptId = attempt?.id || '';

  // Exam app only: send violations (blocked shortcuts, focus loss...) to the API for the admin.
  useSecurityReporter(attemptId || null);

  const {
    questions,
    isLoading: isQuestionsLoading,
    error: questionsError,
    retry: retryQuestions,
  } = useExamQuestions(attemptId);

  const {
    currentIndex,
    localPending,
    questionIds,
    answers,
    questionStates,
    markedForReview,
    initExam,
    setCurrentIndex,
    selectOption,
    setTextResponse,
    getSummary,
  } = useExamStore();

  const { saveAnswer, clearAnswer, toggleReview, restoreAnswersFromStore, isSaving } = useAnswer(attemptId);

  const [restoring, setRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreRetry, setRestoreRetry] = useState(0);
  const [sessionMoved, setSessionMoved] = useState(isSessionMoved);
  useEffect(() => onSessionEvent(event => { if (event === 'moved') setSessionMoved(true); }), []);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isPaletteOpenMobile, setIsPaletteOpenMobile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Person C's sync state. The engine tracks one attempt at a time; ignore it for any other.
  const isSyncedAttempt = useSyncStatus((s) => s.attemptId === attemptId);
  const submitStatus = useSyncStatus((s) => s.submit);
  const answerSyncStatus = useSyncStatus((s) => s.answers);
  const attemptClosed = useSyncStatus((s) => s.attemptClosed);
  const isSubmitPending = isSyncedAttempt && submitStatus === 'pending';

  const questionsCount = questions?.length || 0;

  // Exam app only: lock the window while an attempt is running (no-op in a browser).
  // Unlocking happens on SubmittedPage, or here when there is nothing to take.
  useEffect(() => {
    if (attempt?.status === AttemptStatus.IN_PROGRESS) desktop.setSecurityMode(true);
  }, [attempt?.status]);

  // No attempt to take, or it is already finished: leave the exam screen.
  useEffect(() => {
    if (isAttemptLoading || attemptError || sessionMoved) return;
    if (!attempt) {
      desktop.setSecurityMode(false);
      navigate('/student/dashboard', { replace: true });
    } else if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      navigate('/student/exam/submitted', { replace: true });
    }
  }, [isAttemptLoading, attempt, attemptError, sessionMoved, navigate]);

  // A submission queued while offline finishes in the background; follow it.
  useEffect(() => {
    if (isSyncedAttempt && submitStatus === 'submitted') {
      navigate('/student/exam/submitted', { replace: true });
    }
  }, [isSyncedAttempt, submitStatus, navigate]);

  // Initialize question IDs in local store when questions load
  useEffect(() => {
    if (questions && questions.length > 0) {
      const qIds = questions.map((q) => q.id);
      initExam(qIds, Object.fromEntries(questions.map(q => [q.id, q.type])));
      setRestoring(true); setRestoreError(null);
      let cancelled = false;
      void (async () => {
        try {
          await restoreAnswersFromStore();
          const rows = questions.some(q => q.type === QuestionType.CODING) && !isFixtureAttempt(attemptId) ? await getLatestCodeSubmissions(attemptId) : [];
          if (cancelled) return;
          useExamStore.getState().loadCodeSubmissions(rows);
          const position = qIds.indexOf(attempt?.lastQuestionId ?? '');
          if (position >= 0) setCurrentIndex(position);
          setRestoring(false);
        } catch (error) { if (!cancelled) { setRestoreError(getErrorMessage(error)); setRestoring(false); } }
      })();
      return () => { cancelled = true; };
    }
  }, [questionsCount, attemptId, initExam, restoreAnswersFromStore, restoreRetry]);

  // Handle timer expiry (auto-submit). The server finalizes an expired attempt on
  // its own; requestSubmit() pushes what it can and confirms it, or stays queued if
  // offline. SubmittedPage shows which.
  const handleTimerExpired = useCallback(async () => {
    if (isSessionMoved()) return;
    setIsSubmitting(true);
    try {
      if (attemptId && !isFixtureAttempt(attemptId)) {
        for (const id of useExamStore.getState().questionIds) await saveAnswer(id);
        await requestSubmit(attemptId);
      }
    } catch (err) {
      console.error('Auto-submit error:', err);
    } finally {
      setIsSubmitting(false);
      if (!isSessionMoved()) navigate('/student/exam/submitted', { replace: true });
    }
  }, [attemptId, navigate, saveAnswer]);

  const currentQuestion = questions[currentIndex];
  const CurrentRenderer = currentQuestion ? questionRenderers[currentQuestion.type] : undefined;
  const currentQId = currentQuestion?.id || '';
  const currentDraft = answers[currentQId] || { selectedOptionIds: [], textResponse: '' };
  const isMarked = !!markedForReview[currentQId];

  const hasResponse = Boolean(
    (currentDraft.selectedOptionIds && currentDraft.selectedOptionIds.length > 0) ||
      (currentDraft.textResponse && currentDraft.textResponse.trim().length > 0),
  );

  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < questions.length - 1;
  const isLastQuestion = currentIndex === questions.length - 1;

  const summary = getSummary();

  const navigation = useQuestionNavigation(attemptId, questions, saveAnswer,
    isSubmitting || isSubmitPending || sessionMoved);
  const handleSaveAndNext = () => navigation.requestNavigation(Math.min(currentIndex + 1, questions.length - 1), true);
  useEffect(() => {
    if (restoring || restoreError || !attemptId || !currentQId || sessionMoved || isFixtureAttempt(attemptId)) return;
    void sendHeartbeat(attemptId, currentQId).catch(() => {});
  }, [attemptId, currentQId, restoring, restoreError, sessionMoved]);

  const handleMarkForReviewAndNext = async () => {
    try {
      await toggleReview(currentQId, { advance: false });
      await navigation.requestNavigation(Math.min(currentIndex + 1, questions.length - 1), true);
    } catch (error) { setSubmitError(getErrorMessage(error)); }
  };

  const handleClearResponse = async () => {
    await clearAnswer(currentQId);
  };

  const handleConfirmSubmit = async () => {
    if (!attemptId) return;
    if (isFixtureAttempt(attemptId)) {
      navigate('/student/exam/submitted', { replace: true });
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      // Pushes every unsynced answer first, then submits. 'submitted' navigates via the
      // effect above; 'pending' keeps the modal open until the connection returns.
      await Promise.all(useExamStore.getState().questionIds.map(id => saveAnswer(id)));
      const status = await requestSubmit(attemptId);
      if (status === 'failed') {
        setSubmitError('The server did not accept the submission. Please contact your invigilator.');
      }
    } catch (err) {
      console.error('Submission failed', err);
      setSubmitError('Your submission could not be saved on this device. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const unsavedIds = new Set([...Object.entries(answerSyncStatus).filter(([,s]) => s !== 'synced').map(([id]) => id), ...Object.keys(localPending).filter(id => localPending[id])]);
  const currentSyncStatus = isSyncedAttempt ? answerSyncStatus[currentQId] : undefined;
  const isLocked = isSubmitting || isSubmitPending || sessionMoved || navigation.submitting || navigation.busy || navigation.warningOpen;
  if (sessionMoved) return <div className="flex min-h-screen items-center justify-center p-6"><Alert variant="warning" title="This exam was opened on another device">This computer can no longer change or submit the exam. Tell your invigilator. The timer continues on the approved device.</Alert></div>;
  if (attemptError) return <ErrorState message={getErrorMessage(attemptError)} onRetry={retryAttempt} />;
  if (restoreError) return <ErrorState message={`Could not restore your submission status: ${restoreError}`} onRetry={() => setRestoreRetry(n => n + 1)} />;

  if (questionsError) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-card border border-border rounded-xl p-8 max-w-md text-center shadow-sm">
            <p className="text-base text-foreground font-semibold mb-1">Unable to load the exam</p>
            <p className="text-sm text-muted-foreground mb-4">{questionsError}</p>
            <button
              type="button"
              onClick={retryQuestions}
              className="px-4 py-2 text-sm font-semibold rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isAttemptLoading || isQuestionsLoading || (restoring && questions.length > 0)) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-card border border-border rounded-xl p-8 max-w-md text-center shadow-sm">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-base text-foreground font-semibold mb-1">Loading Exam Questions...</p>
            <p className="text-sm text-muted-foreground">Please wait while the test environment initializes.</p>
          </div>
        </div>
      </div>
    );
  }

  if (questions.length === 0) return <ErrorState message="No questions are available for this exam. Please contact your invigilator." onRetry={retryQuestions} />;
  return (
    <div className="min-h-screen bg-paper flex flex-col font-sans">
      <a href="#exam-question" className="sr-only focus:not-sr-only focus:p-3">Skip to current question</a>
      {/* Person A's Header Bar with Timer, Title, Student Info, Network status & Finish Exam */}
      <Header
        onTimerExpired={handleTimerExpired}
        onFinish={() => setIsSubmitModalOpen(true)}
      />

      <div className="mx-auto w-full max-w-7xl px-4 pt-3" role="status" aria-live="polite">
        {unsavedIds.size > 0
          ? <Alert variant="warning">{unsavedIds.size} unsaved answer(s). Keep this device open until all changes reach the server.</Alert>
          : <p className="text-sm text-muted-foreground">All changes saved to the server.</p>}
        {submitError && !isSubmitModalOpen && <Alert variant="destructive">{submitError}</Alert>}
        {navigation.error && !navigation.warningOpen && <Alert variant="destructive">{navigation.error}</Alert>}
      </div>
      {/* Main Layout Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Side: Question Viewer & Navigation Controls */}
        <div id="exam-question" tabIndex={-1} className="md:col-span-8 lg:col-span-9 flex flex-col justify-between">
          <div>
            {CurrentRenderer && currentQuestion ? (
              <CurrentRenderer
                attemptId={attemptId}
                question={currentQuestion}
                questionNumber={currentIndex + 1}
                totalQuestions={questions.length}
                selectedOptionIds={currentDraft.selectedOptionIds}
                textResponse={currentDraft.textResponse}
                onSelectOption={(optId, isMulti) => { selectOption(currentQId, optId, isMulti); void saveAnswer(currentQId).catch(error => setSubmitError(getErrorMessage(error))); }}
                onTextResponseChange={(text) => setTextResponse(currentQId, text)}
                disabled={isLocked}
              />
            ) : (
              <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
                {currentQuestion ? 'This question type is not supported by this version of the exam client.' : 'Question not found'}
              </div>
            )}
          </div>

          {/* Bottom Action / Navigation controls */}
          <NavigationControls
            canGoPrevious={canGoPrevious}
            canGoNext={canGoNext}
            isLastQuestion={isLastQuestion}
            isMarkedForReview={isMarked}
            hasResponse={hasResponse}
            isSaving={isSaving}
            onPrevious={() => void navigation.requestNavigation(currentIndex - 1)}
            onSaveAndNext={handleSaveAndNext}
            onMarkForReviewAndNext={handleMarkForReviewAndNext}
            onClearResponse={handleClearResponse}
            disabled={isLocked}
          />

          {/* Person C's sync status for the current question */}
          {attemptClosed && isSyncedAttempt ? (
            <p className="mt-3 text-xs text-brick" role="status">
              This attempt is closed. The server is no longer accepting answers.
            </p>
          ) : currentSyncStatus ? (
            <p
              className={`mt-3 text-xs ${currentSyncStatus === 'failed' ? 'text-brick' : 'text-ash-muted'}`}
              role="status"
            >
              {currentSyncStatus === 'synced' && 'Answer saved to the server.'}
              {currentSyncStatus === 'pending' && 'Answer saved on this device. It will sync automatically.'}
              {currentSyncStatus === 'failed' && 'The server did not accept this answer. Change it and save again.'}
            </p>
          ) : null}
        </div>

        {/* Right Side: Question Palette (drawer on mobile, side panel on desktop) */}
        <div
          className={`md:col-span-4 lg:col-span-3 ${
            isPaletteOpenMobile
              ? 'fixed inset-0 z-40 bg-ink/50 p-4 flex flex-col justify-end md:static md:bg-transparent md:p-0'
              : 'hidden md:block'
          }`}
        >
          <div className="h-full bg-paper-raised md:bg-transparent rounded-lg shadow-lg md:shadow-none p-1 md:p-0">
            <QuestionPalette
              questionIds={questionIds}
              currentIndex={currentIndex}
              questionStates={questionStates}
              onSelectQuestion={(idx) => {
                if (!isLocked) void navigation.requestNavigation(idx);
                setIsPaletteOpenMobile(false);
              }}
              summary={summary}
              syncStatus={isSyncedAttempt ? answerSyncStatus : undefined}
            />
          </div>
        </div>
      </main>

      {/* Mobile palette toggle floating button */}
      <div className="md:hidden fixed bottom-4 right-4 z-30">
        <button
          type="button"
          onClick={() => setIsPaletteOpenMobile(!isPaletteOpenMobile)}
          className="px-4 py-2.5 rounded-full bg-blue-600 text-white font-semibold text-xs shadow-lg"
        >
          {isPaletteOpenMobile ? 'Close Palette' : 'Question Palette'}
        </button>
      </div>

      <Dialog open={navigation.warningOpen} onOpenChange={open => { if (!open) navigation.cancelNavigation(); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogTitle className="pr-6">Your latest code is not submitted</DialogTitle>
          <DialogDescription>{exam?.gradeUnsubmittedCode
            ? 'Submit to confirm this version. A saved draft is graded only if you never submitted a version.'
            : 'Your progress is saved, but unsubmitted code is not graded. If you submitted earlier, that version still counts.'}</DialogDescription>
          {navigation.error && <Alert variant="destructive">{navigation.error}</Alert>}
          <DialogFooter>
            <Button className="h-auto whitespace-normal text-center" variant="outline" disabled={navigation.submitting} onClick={navigation.continueWithoutSubmitting}>Continue without submitting</Button>
            <Button loading={navigation.submitting} onClick={() => void navigation.submitAndContinue()}>Submit now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Submit Confirmation Modal */}
      <SubmitConfirmationModal
        isOpen={isSubmitModalOpen || isSubmitPending}
        onClose={() => {
          setIsSubmitModalOpen(false);
          setSubmitError(null);
        }}
        onConfirm={handleConfirmSubmit}
        summary={summary}
        gradeUnsubmittedCode={exam?.gradeUnsubmittedCode}
        onSelectQuestion={index => { setIsSubmitModalOpen(false); void navigation.requestNavigation(index); }}
        isSubmitting={isSubmitting}
        isSubmitPending={isSubmitPending}
        error={submitError}
      />
    </div>
  );
}

export { ExamPage };
