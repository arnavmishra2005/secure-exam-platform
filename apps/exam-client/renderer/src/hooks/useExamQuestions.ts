/**
 * Owner: Person B
 * Hook to retrieve questions for an exam.
 * Reads from AttemptContext if available (Person A),
 * or falls back to packages/api-client getExamQuestions.
 */
import { useEffect, useState } from 'react';
import { PublicQuestion } from '@secure-exam/types';
import { useAttemptContext } from '../contexts/AttemptContext';
import { getExamQuestions } from '@secure-exam/api-client';

export function useExamQuestions(examId?: string) {
  const attemptCtx = useAttemptContext();
  const [questions, setQuestions] = useState<PublicQuestion[]>(attemptCtx.questions || []);
  const [isLoading, setIsLoading] = useState<boolean>(!attemptCtx.questions?.length);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If context already provided questions, use them
    if (attemptCtx.questions && attemptCtx.questions.length > 0) {
      setQuestions(attemptCtx.questions);
      setIsLoading(false);
      return;
    }

    if (!examId) return;

    let isMounted = true;
    setIsLoading(true);

    getExamQuestions(examId)
      .then((data) => {
        if (!isMounted) return;
        // Transform QuestionWithOptions to PublicQuestion (omit explanation, omit isCorrect)
        const publicQs: PublicQuestion[] = data.map((q) => ({
          id: q.id,
          text: q.text,
          type: q.type,
          marks: q.marks,
          negativeMarks: q.negativeMarks,
          createdAt: q.createdAt,
          updatedAt: q.updatedAt,
          options: q.options.map((opt) => ({
            id: opt.id,
            questionId: opt.questionId,
            text: opt.text,
            order: opt.order,
          })),
        }));
        setQuestions(publicQs);
        setError(null);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('Could not fetch questions from API, using fallback', err);
        setError(err?.message || 'Failed to load questions');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [examId, attemptCtx.questions]);

  return { questions, isLoading, error };
}
