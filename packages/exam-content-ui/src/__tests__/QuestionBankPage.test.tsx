import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuestionStatus, QuestionType } from '@secure-exam/types';
import { PickForExamDialog } from '../question-bank/PickForExamDialog';
import { QuestionBankPage } from '../question-bank/QuestionBankPage';
import { createFakeApi, seedState } from '../testing/fakeApi';
import { renderWithApi } from './render';

describe('QuestionBankPage', () => {
  it('lists questions with type, status and lock state', async () => {
    renderWithApi(<QuestionBankPage onCreate={vi.fn()} onEdit={vi.fn()} />, createFakeApi());
    expect(await screen.findByText('Sum of a list')).toBeTruthy();
    expect(screen.getByText('Locked')).toBeTruthy();
    expect(screen.getByText('1–4 of 4')).toBeTruthy();
  });

  it('filters by type through the API', async () => {
    const api = createFakeApi();
    const list = vi.spyOn(api, 'listBankQuestions');
    renderWithApi(<QuestionBankPage onCreate={vi.fn()} onEdit={vi.fn()} />, api);
    await screen.findByText('Sum of a list');
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: QuestionType.CODING } });
    await waitFor(() => expect(screen.getByText('1–1 of 1')).toBeTruthy());
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ type: QuestionType.CODING, page: 1 }));
  });

  it('disables Delete for questions used in exams, and archives through metadata', async () => {
    const state = seedState();
    const api = createFakeApi(state);
    const meta = vi.spyOn(api, 'updateBankQuestionMeta');
    renderWithApi(<QuestionBankPage onCreate={vi.fn()} onEdit={vi.fn()} />, api);
    const lockedRow = (await screen.findByText(state.questions[0].text)).closest('tr')!;
    expect((within(lockedRow).getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(lockedRow).getByRole('button', { name: 'Archive' }));
    await waitFor(() =>
      expect(meta).toHaveBeenCalledWith(state.questions[0].id, { status: QuestionStatus.ARCHIVED }),
    );
    expect(await within(lockedRow).findByRole('button', { name: 'Restore' })).toBeTruthy();
  });

  it('opens a question for editing', async () => {
    const state = seedState();
    const onEdit = vi.fn();
    renderWithApi(<QuestionBankPage onCreate={vi.fn()} onEdit={onEdit} />, createFakeApi(state));
    fireEvent.click(await screen.findByText('Sum of a list'));
    expect(onEdit).toHaveBeenCalledWith(state.questions[2].id);
  });
});

describe('PickForExamDialog', () => {
  it('offers only READY questions not already in the exam, and adds them in pick order', async () => {
    const state = seedState();
    const api = createFakeApi(state);
    const list = vi.spyOn(api, 'listBankQuestions');
    const add = vi.spyOn(api, 'addBankQuestionsToExam');
    const onAdded = vi.fn();
    renderWithApi(<PickForExamDialog examId="exam-demo" open onClose={vi.fn()} onAdded={onAdded} />, api);

    await screen.findByText('Sum of a list');
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ status: QuestionStatus.READY, excludeExamId: 'exam-demo' }));
    expect(screen.queryByText(state.questions[0].text)).toBeNull(); // already in exam
    expect(screen.queryByText('Which of these are immutable?')).toBeNull(); // DRAFT

    fireEvent.click(screen.getByLabelText('Select Sum of a list'));
    fireEvent.click(screen.getByLabelText('Select Lists in Python are mutable.'));
    fireEvent.click(screen.getByRole('button', { name: 'Add to exam' }));

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(add).toHaveBeenCalledWith('exam-demo', [state.questions[2].id, state.questions[1].id]);
    expect(await screen.findByText('Added 2.')).toBeTruthy();
  });
});
