import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeLanguage, CodeSubmissionStatus, QuestionType, type PublicQuestion } from '@secure-exam/types';
import { submitCode } from '@secure-exam/api-client';
import { useExamStore } from '../store/examStore';
import { useQuestionNavigation } from './useQuestionNavigation';

vi.mock('@secure-exam/api-client', () => ({ submitCode: vi.fn() }));
const questions = [
  { id: 'code', type: QuestionType.CODING, coding: { allowedLanguages: [CodeLanguage.PYTHON] } },
  { id: 'other', type: QuestionType.MCQ_SINGLE },
] as PublicQuestion[];
const saved = { questionId: 'code', code: 'print(1)', language: CodeLanguage.PYTHON, submissionId: 'sub', status: CodeSubmissionStatus.PENDING, savedAt: '2026-11-04T10:00:00Z' };

describe('guarded question navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useExamStore.getState().initExam(['code', 'other'], { code: QuestionType.CODING, other: QuestionType.MCQ_SINGLE });
    useExamStore.getState().setTextResponse('code', 'print(1)');
  });
  it('palette navigation saves, warns and goes to the requested question only after confirmation', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useQuestionNavigation('attempt', questions, save, false));
    await act(() => result.current.requestNavigation(1));
    expect(save).toHaveBeenCalledWith('code');
    expect(result.current.warningOpen).toBe(true);
    expect(useExamStore.getState().currentIndex).toBe(0);
    act(() => result.current.continueWithoutSubmitting());
    expect(useExamStore.getState().currentIndex).toBe(1);
  });
  it('closing the warning stays on the question; a later navigation warns again', async () => {
    const { result } = renderHook(() => useQuestionNavigation('attempt', questions, vi.fn().mockResolvedValue(undefined), false));
    await act(() => result.current.requestNavigation(1));
    act(() => result.current.cancelNavigation());
    expect(useExamStore.getState().currentIndex).toBe(0);
    await act(() => result.current.requestNavigation(1));
    expect(result.current.warningOpen).toBe(true);
  });
  it('submits the source question before navigating, and warns for edits after submission', async () => {
    vi.mocked(submitCode).mockResolvedValue(saved);
    const { result } = renderHook(() => useQuestionNavigation('attempt', questions, vi.fn().mockResolvedValue(undefined), false));
    await act(() => result.current.requestNavigation(1));
    await act(() => result.current.submitAndContinue());
    expect(submitCode).toHaveBeenCalledWith('attempt', { questionId: 'code', code: 'print(1)', language: CodeLanguage.PYTHON });
    expect(useExamStore.getState().currentIndex).toBe(1);
    act(() => { useExamStore.getState().setCurrentIndex(0); useExamStore.getState().setTextResponse('code', 'print(2)'); });
    await act(() => result.current.requestNavigation(1));
    expect(result.current.warningOpen).toBe(true);
  });
  it('allows unchanged submitted code and refuses navigation after a failed save', async () => {
    act(() => useExamStore.getState().recordCodeSubmission(saved));
    const save = vi.fn().mockRejectedValueOnce(new Error('Disk unavailable')).mockResolvedValue(undefined);
    const { result } = renderHook(() => useQuestionNavigation('attempt', questions, save, false));
    await act(() => result.current.requestNavigation(1));
    expect(useExamStore.getState().currentIndex).toBe(0);
    expect(result.current.error).toBeTruthy();
    await act(() => result.current.requestNavigation(1));
    expect(result.current.warningOpen).toBe(false);
    expect(useExamStore.getState().currentIndex).toBe(1);
  });
});
