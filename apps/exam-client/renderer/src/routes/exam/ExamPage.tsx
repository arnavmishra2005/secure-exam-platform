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
import { AttemptStatus } from '@secure-exam/types';
import { useAttempt } from '../../hooks/useAttempt';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { useExamQuestions } from '../../hooks/useExamQuestions';
import { useExamStore } from '../../store/examStore';
import { useAnswer } from '../../hooks/useAnswer';
import { Header } from '../../components/layout/Header';
import { QuestionRenderer } from '../../components/exam/QuestionRenderer';
import { QuestionPalette } from '../../components/exam/QuestionPalette';
import { NavigationControls } from '../../components/exam/NavigationControls';
import { SubmitConfirmationModal } from '../../components/exam/SubmitConfirmationModal';
import { isFixtureAttempt } from '../../contexts/AttemptContext';
import { requestSubmit } from '../../persistence';

export default function ExamPage() {
  const navigate = useNavigate();
  const { attempt, isLoading: isAttemptLoading } = useAttempt();
  const attemptId = attempt?.id || '';

  const {
    questions,
    isLoading: isQuestionsLoading,
    error: questionsError,
    retry: retryQuestions,
  } = useExamQuestions(attemptId);

  const {
    currentIndex,
    questionIds,
    answers,
    questionStates,
    markedForReview,
    initExam,
    setCurrentIndex,
    goToNext,
    goToPrevious,
    selectOption,
    setTextResponse,
    getSummary,
  } = useExamStore();

  const { saveAnswer, clearAnswer, toggleReview, restoreAnswersFromStore, isSaving } = useAnswer(attemptId);

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

  // No attempt to take, or it is already finished: leave the exam screen.
  useEffect(() => {
    if (isAttemptLoading) return;
    if (!attempt) {
      navigate('/instructions', { replace: true });
    } else if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      navigate('/submitted', { replace: true });
    }
  }, [isAttemptLoading, attempt, navigate]);

  // A submission queued while offline finishes in the background; follow it.
  useEffect(() => {
    if (isSyncedAttempt && submitStatus === 'submitted') {
      navigate('/submitted', { replace: true });
    }
  }, [isSyncedAttempt, submitStatus, navigate]);

  // Initialize question IDs in local store when questions load
  useEffect(() => {
    if (questions && questions.length > 0) {
      const qIds = questions.map((q) => q.id);
      initExam(qIds);
      restoreAnswersFromStore();
    }
  }, [questionsCount, attemptId, initExam, restoreAnswersFromStore]);

  // Handle timer expiry (auto-submit). The server finalizes an expired attempt on
  // its own; requestSubmit() pushes what it can and confirms it, or stays queued if
  // offline. SubmittedPage shows which.
  const handleTimerExpired = useCallback(async () => {
    setIsSubmitting(true);
    try {
      if (attemptId && !isFixtureAttempt(attemptId)) {
        await requestSubmit(attemptId);
      }
    } catch (err) {
      console.error('Auto-submit error:', err);
    } finally {
      setIsSubmitting(false);
      navigate('/submitted', { replace: true });
    }
  }, [attemptId, navigate]);

  const currentQuestion = questions[currentIndex];
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

  // Navigation handlers
  const handleSaveAndNext = async () => {
    await saveAnswer(currentQId, { advance: canGoNext });
  };

  const handleMarkForReviewAndNext = async () => {
    await toggleReview(currentQId, { advance: canGoNext });
  };

  const handleClearResponse = async () => {
    await clearAnswer(currentQId);
  };

  const handleConfirmSubmit = async () => {
    if (!attemptId) return;
    if (isFixtureAttempt(attemptId)) {
      navigate('/submitted', { replace: true });
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      // Pushes every unsynced answer first, then submits. 'submitted' navigates via the
      // effect above; 'pending' keeps the modal open until the connection returns.
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

  const currentSyncStatus = isSyncedAttempt ? answerSyncStatus[currentQId] : undefined;
  const isLocked = isSubmitting || isSubmitPending;

  if (questionsError) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white border border-gray-200 rounded-xl p-8 max-w-md text-center shadow-sm">
            <p className="text-base text-gray-800 font-semibold mb-1">Unable to load the exam</p>
            <p className="text-sm text-gray-500 mb-4">{questionsError}</p>
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

  if (isQuestionsLoading || !questions || questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white border border-gray-200 rounded-xl p-8 max-w-md text-center shadow-sm">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-base text-gray-800 font-semibold mb-1">Loading Exam Questions...</p>
            <p className="text-sm text-gray-500">Please wait while the test environment initializes.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col font-sans">
      {/* Person A's Header Bar with Timer, Title, Student Info, Network status & Finish Exam */}
      <Header
        onTimerExpired={handleTimerExpired}
        onFinish={() => setIsSubmitModalOpen(true)}
      />

      {/* Main Layout Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Side: Question Viewer & Navigation Controls */}
        <div className="md:col-span-8 lg:col-span-9 flex flex-col justify-between">
          <div>
            {currentQuestion ? (
              <QuestionRenderer
                question={currentQuestion}
                questionNumber={currentIndex + 1}
                totalQuestions={questions.length}
                selectedOptionIds={currentDraft.selectedOptionIds}
                textResponse={currentDraft.textResponse}
                onSelectOption={(optId, isMulti) => selectOption(currentQId, optId, isMulti)}
                onTextResponseChange={(text) => setTextResponse(currentQId, text)}
                disabled={isLocked}
              />
            ) : (
              <div className="bg-paper-raised p-8 text-center rounded border border-hairline text-ash">
                Question not found
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
            onPrevious={goToPrevious}
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
                setCurrentIndex(idx);
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

      {/* Submit Confirmation Modal */}
      <SubmitConfirmationModal
        isOpen={isSubmitModalOpen || isSubmitPending}
        onClose={() => {
          setIsSubmitModalOpen(false);
          setSubmitError(null);
        }}
        onConfirm={handleConfirmSubmit}
        summary={summary}
        isSubmitting={isSubmitting}
        isSubmitPending={isSubmitPending}
        error={submitError}
      />
    </div>
  );
}

export { ExamPage };
