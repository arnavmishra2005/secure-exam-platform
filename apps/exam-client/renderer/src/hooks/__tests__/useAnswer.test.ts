// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { QuestionState } from '@secure-exam/types';
import { listAnswers } from '@secure-exam/api-client';
import { configurePersistence, getOfflineStore } from '../../persistence';
import { createMemoryStore } from '../../persistence/memoryStore';
import { FIXTURE_ATTEMPT_ID } from '../../contexts/AttemptContext';
import { useExamStore } from '../../store/examStore';
import { useAnswer } from '../useAnswer';

// B's seam into C's persistence layer, with only the Phase 1 API faked.
vi.mock('@secure-exam/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@secure-exam/api-client')>()),
  listAnswers: vi.fn().mockResolvedValue([]),
}));

const ATTEMPT = 'attempt-1';
const api = { saveAnswer: vi.fn().mockResolvedValue({}), submitAttempt: vi.fn().mockResolvedValue({}) };
configurePersistence({ store: createMemoryStore(), api, ping: () => Promise.resolve(true) });

beforeEach(() => {
  api.saveAnswer.mockClear();
  useExamStore.getState().initExam(['q1', 'q2', 'q3']);
});

it('saves the draft through the persistence layer, which syncs it to the Answer API', async () => {
  useExamStore.getState().selectOption('q1', 'opt-a', false);
  const { result } = renderHook(() => useAnswer(ATTEMPT));

  await act(() => result.current.saveAnswer('q1'));

  expect(await getOfflineStore().getAnswer(ATTEMPT, 'q1')).toMatchObject({
    payload: { selectedOptionIds: ['opt-a'], markedForReview: false },
  });
  await waitFor(() =>
    expect(api.saveAnswer).toHaveBeenCalledWith(ATTEMPT, 'q1', expect.objectContaining({ selectedOptionIds: ['opt-a'] })),
  );
  expect(useExamStore.getState().questionStates.q1).toBe(QuestionState.ANSWERED);
});

it('persists the new review flag when toggling review', async () => {
  const { result } = renderHook(() => useAnswer(ATTEMPT));

  await act(() => result.current.toggleReview('q2'));
  expect((await getOfflineStore().getAnswer(ATTEMPT, 'q2'))?.payload.markedForReview).toBe(true);

  await act(() => result.current.toggleReview('q2'));
  expect((await getOfflineStore().getAnswer(ATTEMPT, 'q2'))?.payload.markedForReview).toBe(false);
});

it('restores saved answers, including cleared ones, into the exam store after a reload', async () => {
  const store = getOfflineStore();
  await store.saveAnswer(ATTEMPT, 'q1', { selectedOptionIds: ['opt-b'], markedForReview: true });
  await store.saveAnswer(ATTEMPT, 'q3', { selectedOptionIds: ['opt-c'] });
  await store.saveAnswer(ATTEMPT, 'q3', { clearResponse: true });
  const { result } = renderHook(() => useAnswer(ATTEMPT));

  await act(() => result.current.restoreAnswersFromStore());

  const state = useExamStore.getState();
  expect(state.answers.q1.selectedOptionIds).toEqual(['opt-b']);
  expect(state.questionStates.q1).toBe(QuestionState.ANSWERED_AND_MARKED_REVIEW);
  expect(state.markedForReview.q1).toBe(true);
  expect(state.answers.q3.selectedOptionIds).toEqual([]);
  expect(state.questionStates.q3).toBe(QuestionState.VISITED);
});

it("restores the server's saved answers, with this device's edits taking precedence", async () => {
  const saved = (questionId: string, selectedOptionIds: string[], state: QuestionState) =>
    ({ questionId, selectedOptionIds, textResponse: null, state }) as any;
  vi.mocked(listAnswers).mockResolvedValueOnce([
    saved('q1', ['opt-server'], QuestionState.ANSWERED),
    saved('q2', ['opt-a'], QuestionState.ANSWERED_AND_MARKED_REVIEW),
  ]);
  await getOfflineStore().saveAnswer('attempt-2', 'q1', { selectedOptionIds: ['opt-local'] });
  const { result } = renderHook(() => useAnswer('attempt-2'));

  await act(() => result.current.restoreAnswersFromStore());

  expect(listAnswers).toHaveBeenCalledWith('attempt-2');
  const state = useExamStore.getState();
  expect(state.answers.q1.selectedOptionIds).toEqual(['opt-local']);
  expect(state.answers.q2.selectedOptionIds).toEqual(['opt-a']);
  expect(state.questionStates.q2).toBe(QuestionState.ANSWERED_AND_MARKED_REVIEW);
  expect(state.markedForReview.q2).toBe(true);
});

it('keeps answers to the demo attempt on this device without calling the API', async () => {
  useExamStore.getState().selectOption('q1', 'opt-a', false);
  const { result } = renderHook(() => useAnswer(FIXTURE_ATTEMPT_ID));

  await act(() => result.current.saveAnswer('q1'));

  expect(await getOfflineStore().getAnswer(FIXTURE_ATTEMPT_ID, 'q1')).not.toBeNull();
  expect(api.saveAnswer).not.toHaveBeenCalled();
});
