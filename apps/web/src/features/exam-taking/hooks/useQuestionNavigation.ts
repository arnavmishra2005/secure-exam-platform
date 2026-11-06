import { useRef, useState } from 'react';
import { submitCode } from '@secure-exam/api-client';
import { QuestionType, decodeCodeDraft, defaultLanguage, type PublicQuestion } from '@secure-exam/types';
import { getErrorMessage } from '@/lib/errors';
import { useExamStore } from '../store/examStore';

/** Every question-navigation control passes through the same save/Submit check. */
export function useQuestionNavigation(attemptId: string, questions: PublicQuestion[], saveAnswer: (id: string) => Promise<unknown>, disabled: boolean) {
  const [pending, setPending] = useState<{ target: number; question: PublicQuestion } | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const requestNavigation = async (target: number, saveCurrent = false) => {
    if (disabled || inFlight.current || pending || target < 0 || target >= questions.length) return;
    const state = useExamStore.getState();
    if (target === state.currentIndex && !saveCurrent) return;
    const question = questions[state.currentIndex];
    if (!question) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      await saveAnswer(question.id);
      const fresh = useExamStore.getState();
      if (question.type === QuestionType.CODING &&
        (!fresh.codeSubmittedAt[question.id] || fresh.codeDirtySinceSubmit[question.id])) {
        setPending({ target, question });
      } else fresh.setCurrentIndex(target);
    } catch (err) { setError(getErrorMessage(err)); }
    finally { inFlight.current = false; setBusy(false); }
  };

  const continueWithoutSubmitting = () => {
    if (!pending || inFlight.current || disabled) return;
    useExamStore.getState().setCurrentIndex(pending.target);
    setPending(null); setError(null);
  };

  const submitAndContinue = async () => {
    if (!pending || inFlight.current || disabled) return;
    inFlight.current = true; setSubmitting(true); setError(null);
    try {
      const { question, target } = pending;
      // The draft carries its language (#16); submit exactly that code in that language.
      const draft = decodeCodeDraft(useExamStore.getState().answers[question.id]?.textResponse);
      const code = draft.code;
      const allowed = question.coding?.allowedLanguages;
      const language = draft.language && (!allowed?.length || allowed.includes(draft.language)) ? draft.language : defaultLanguage(allowed);
      const result = await submitCode(attemptId, { questionId: question.id, code, language });
      useExamStore.getState().recordCodeSubmission({ questionId: question.id, code, language, ...result });
      useExamStore.getState().setCurrentIndex(target);
      setPending(null);
    } catch (err) { setError(getErrorMessage(err)); }
    finally { inFlight.current = false; setSubmitting(false); }
  };

  return { requestNavigation, continueWithoutSubmitting, submitAndContinue,
    warningOpen: pending !== null, busy, submitting, error,
    cancelNavigation: () => { if (!inFlight.current) { setPending(null); setError(null); } },
  };
}
