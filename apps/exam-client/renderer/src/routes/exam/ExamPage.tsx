/**
 * Owner: Person B
 * ExamPage: Main container screen for the exam-taking interface.
 *
 * Consumes:
 *  - Person A's AttemptContext (for exam metadata, questions, timer countdown)
 *  - Person C's offline-aware save hook (via useAnswer hook)
 *
 * Strictly decoupled: doesn't talk directly to IndexedDB or raw API endpoints.
 */
import React, { useEffect, useState } from 'react';
import { useAttemptContext } from '../../contexts/AttemptContext';
import { useExamStore } from '../../store/examStore';
import { useAnswer } from '../../hooks/useAnswer';
import { QuestionRenderer } from '../../components/exam/QuestionRenderer';
import { QuestionPalette } from '../../components/exam/QuestionPalette';
import { NavigationControls } from '../../components/exam/NavigationControls';
import { SubmitConfirmationModal } from '../../components/exam/SubmitConfirmationModal';

export const ExamPage: React.FC = () => {
  const { exam, attempt, questions, remainingSeconds, submitAttempt, isSubmitting } = useAttemptContext();
  const attemptId = attempt?.id || '';

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

  const questionsCount = questions?.length || 0;

  // Initialize question IDs in local store when questions load
  useEffect(() => {
    if (questions && questions.length > 0) {
      const qIds = questions.map((q) => q.id);
      initExam(qIds);
      restoreAnswersFromStore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionsCount, attemptId]);

  // Handle timer expiry (auto-submit)
  useEffect(() => {
    if (remainingSeconds === 0 && attempt && attempt.status === 'IN_PROGRESS') {
      submitAttempt().catch((err) => {
        console.error('Auto-submit failed:', err);
      });
    }
  }, [remainingSeconds, attempt?.status, submitAttempt]);

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
    try {
      await submitAttempt();
      setIsSubmitModalOpen(false);
    } catch (err) {
      console.error('Submission failed', err);
    }
  };

  // Format countdown timer (HH:MM:SS)
  const formatTimer = (totalSec: number) => {
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    return `${hours > 0 ? `${hours}:` : ''}${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
  };

  const isLowTime = remainingSeconds < 300 && remainingSeconds > 0; // Less than 5 mins

  if (attempt?.status === 'SUBMITTED') {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-6 font-sans">
        <div className="bg-paper-raised border border-hairline rounded p-8 max-w-md w-full text-center shadow-lg">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
            ✓
          </div>
          <h2 className="font-serif text-2xl font-bold text-ink mb-2">Examination Submitted</h2>
          <p className="text-sm text-ash-muted mb-6">
            Your responses have been securely recorded. You may now close this browser window.
          </p>
          <div className="p-4 bg-paper rounded border border-hairline text-left text-xs space-y-2 font-mono text-ash mb-4">
            <div><span className="font-semibold text-ink">Exam:</span> {exam?.title}</div>
            <div><span className="font-semibold text-ink">Attempt:</span> {attemptId}</div>
            <div><span className="font-semibold text-ink">Total Questions:</span> {questions.length}</div>
            <div><span className="font-semibold text-ink">Submitted At:</span> {attempt.submittedAt || new Date().toLocaleTimeString()}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!questions || questions.length === 0) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-6">
        <div className="bg-paper-raised border border-hairline rounded p-8 max-w-md text-center">
          <p className="font-serif text-lg text-ink font-semibold mb-2">Loading Exam Questions...</p>
          <p className="text-sm text-ash-muted">Please wait while the test environment initializes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col font-sans">
      {/* Top Header Bar */}
      <header className="bg-paper-raised border-b border-hairline sticky top-0 z-30 px-4 sm:px-6 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="font-serif font-bold text-base sm:text-lg text-ink truncate max-w-[240px] sm:max-w-md">
              {exam?.title || 'Exam Session'}
            </h1>
            <p className="text-xs text-ash-muted font-mono hidden sm:block">
              Attempt ID: {attemptId ? attemptId.substring(0, 8) + '...' : 'Local'}
            </p>
          </div>
        </div>

        {/* Center / Right: Countdown timer & Quick action */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Timer Display */}
          <div
            className={`px-3 py-1.5 rounded border flex items-center gap-2 font-mono text-sm font-bold tracking-wider ${
              isLowTime
                ? 'bg-brick-light text-brick border-brick/40 animate-pulse'
                : 'bg-white border-hairline text-ink'
            }`}
            title="Time remaining"
          >
            <svg className="w-4 h-4 stroke-current stroke-2 fill-none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{formatTimer(remainingSeconds)}</span>
          </div>

          {/* Toggle palette on mobile */}
          <button
            type="button"
            onClick={() => setIsPaletteOpenMobile(!isPaletteOpenMobile)}
            className="md:hidden px-3 py-1.5 text-xs font-medium rounded border border-hairline bg-white text-ink"
          >
            {isPaletteOpenMobile ? 'Close Palette' : 'Palette'}
          </button>

          {/* Submit button in header for easy access */}
          <button
            type="button"
            onClick={() => setIsSubmitModalOpen(true)}
            className="hidden sm:inline-flex px-4 py-1.5 text-xs font-semibold rounded bg-brick hover:bg-brick/90 text-white transition-colors shadow-xs"
          >
            Finish Exam
          </button>
        </div>
      </header>

      {/* Main Layout Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Side: Question Viewer & Navigation (8 cols on desktop) */}
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
                disabled={isSubmitting}
              />
            ) : (
              <div className="bg-paper-raised p-8 text-center rounded border border-hairline">
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
            disabled={isSubmitting}
          />
        </div>

        {/* Right Side: Question Palette (4 cols on desktop, responsive drawer on mobile) */}
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
            />
          </div>
        </div>
      </main>

      {/* Submit Confirmation Modal */}
      <SubmitConfirmationModal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        onConfirm={handleConfirmSubmit}
        summary={summary}
        isSubmitting={isSubmitting}
      />
    </div>
  );
};
