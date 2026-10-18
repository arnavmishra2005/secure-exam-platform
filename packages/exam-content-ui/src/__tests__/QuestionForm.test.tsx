import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuestionStatus, QuestionType } from '@secure-exam/types';
import { QuestionForm } from '../question-bank/QuestionForm';
import { createFakeApi, seedState } from '../testing/fakeApi';
import { renderWithApi } from './render';

const typeSelect = () => screen.getByLabelText('Type') as HTMLSelectElement;

describe('QuestionForm (create)', () => {
  it('blocks saving an MCQ until it has text, filled options and one correct answer', async () => {
    const api = createFakeApi();
    const create = vi.spyOn(api, 'createBankQuestion');
    renderWithApi(<QuestionForm onSaved={vi.fn()} onCancel={vi.fn()} />, api);

    fireEvent.click(screen.getByRole('button', { name: 'Create question' }));
    expect(await screen.findByText('Question text is required.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Capital of France?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create question' }));
    expect(await screen.findByText('Add at least two options.')).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it('creates an MCQ with normalized options, tags and status', async () => {
    const api = createFakeApi();
    const create = vi.spyOn(api, 'createBankQuestion');
    const onSaved = vi.fn();
    renderWithApi(<QuestionForm onSaved={onSaved} onCancel={vi.fn()} />, api);

    fireEvent.change(screen.getByLabelText('Question'), { target: { value: '  Capital of France?  ' } });
    ['Paris', 'Rome'].forEach((t, i) => fireEvent.change(screen.getByLabelText(`Option ${i + 1}`), { target: { value: t } }));
    fireEvent.click(screen.getByLabelText('Remove option 4'));
    fireEvent.click(screen.getByLabelText('Remove option 3'));
    fireEvent.change(screen.getByLabelText('Add tag'), { target: { value: 'Geography' } });
    fireEvent.keyDown(screen.getByLabelText('Add tag'), { key: 'Enter' });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: QuestionStatus.DRAFT } });
    fireEvent.click(screen.getByRole('button', { name: 'Create question' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Capital of France?',
        type: QuestionType.MCQ_SINGLE,
        status: QuestionStatus.DRAFT,
        tags: ['geography'],
        options: [
          { text: 'Paris', isCorrect: true, order: 0 },
          { text: 'Rome', isCorrect: false, order: 1 },
        ],
      }),
    );
    expect(create.mock.calls[0][0]).not.toHaveProperty('coding');
  });

  it('creates a coding question with its problem and tests, and no options', async () => {
    const api = createFakeApi();
    const create = vi.spyOn(api, 'createBankQuestion');
    renderWithApi(<QuestionForm onSaved={vi.fn()} onCancel={vi.fn()} />, api);

    fireEvent.change(typeSelect(), { target: { value: QuestionType.CODING } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Reverse a string' } });
    fireEvent.change(screen.getByLabelText('Problem statement'), { target: { value: 'Print the input reversed.' } });
    fireEvent.change(screen.getByLabelText('Test 1 input'), { target: { value: 'abc' } });
    fireEvent.change(screen.getByLabelText('Test 1 expected output'), { target: { value: 'cba' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add test' }));
    fireEvent.change(screen.getByLabelText('Test 2 input'), { target: { value: 'hello' } });
    fireEvent.change(screen.getByLabelText('Test 2 expected output'), { target: { value: 'olleh' } });
    fireEvent.change(await screen.findByLabelText('Reference solution'), { target: { value: 'print(input()[::-1])' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create question' }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    const body = create.mock.calls[0][0];
    expect(body.options).toBeUndefined();
    expect(body.coding).toMatchObject({
      statementMd: 'Print the input reversed.',
      referenceSolution: 'print(input()[::-1])',
      tests: [
        { input: 'abc', expectedOutput: 'cba', isSample: true, weight: 1 },
        { input: 'hello', expectedOutput: 'olleh', isSample: false, weight: 1 },
      ],
    });
  });
});

describe('QuestionForm (edit)', () => {
  it('replaces an unlocked question with PUT', async () => {
    const state = seedState();
    const api = createFakeApi(state);
    const replace = vi.spyOn(api, 'replaceBankQuestion');
    const tf = state.questions.find((q) => q.type === QuestionType.TRUE_FALSE)!;
    renderWithApi(<QuestionForm questionId={tf.id} onSaved={vi.fn()} onCancel={vi.fn()} />, api);

    const text = (await screen.findByLabelText('Question')) as HTMLTextAreaElement;
    expect(text.value).toBe(tf.text);
    fireEvent.change(text, { target: { value: 'Python lists can change after creation.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save question' }));
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(tf.id, expect.objectContaining({ text: 'Python lists can change after creation.' })),
    );
  });

  it('lets a professor fix an answered question, keeping type and option count, then recalculate', async () => {
    const state = seedState();
    const api = createFakeApi(state);
    const replace = vi.spyOn(api, 'replaceBankQuestion');
    const recalc = vi.spyOn(api, 'recalculateResults');
    const answered = state.questions.find((q) => q.locked)!;
    const onSaved = vi.fn();
    renderWithApi(<QuestionForm questionId={answered.id} onSaved={onSaved} onCancel={vi.fn()} onDuplicated={vi.fn()} />, api);

    expect(await screen.findByText(/Students have already answered this question \(in Python basics\)/)).toBeTruthy();
    expect((screen.getByLabelText('Question') as HTMLTextAreaElement).disabled).toBe(false);
    expect((screen.getByLabelText('Type') as HTMLSelectElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Add option' })).toBeNull();
    expect(screen.queryByLabelText('Remove option 1')).toBeNull();

    // Fix the answer key and the marks.
    fireEvent.click(screen.getByLabelText('Option 2 is correct'));
    fireEvent.change(screen.getByLabelText('Marks'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save question' }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        answered.id,
        expect.objectContaining({
          marks: 2,
          options: [
            expect.objectContaining({ text: 'for', isCorrect: false }),
            expect.objectContaining({ text: 'foreach', isCorrect: true }),
            expect.objectContaining({ text: 'loop', isCorrect: false }),
          ],
        }),
      ),
    );
    expect(await screen.findByText('Question saved.')).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Recalculate results' }));
    expect(await screen.findByText(/Updated 1 of 2 results; 1 coding answers are being graded again/)).toBeTruthy();
    expect(recalc).toHaveBeenCalledWith('exam-demo', { questionId: answered.id });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onSaved).toHaveBeenCalled();
  });
});
