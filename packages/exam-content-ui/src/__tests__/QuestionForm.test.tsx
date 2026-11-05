import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CodeLanguage, NO_TOPIC, QuestionStatus, QuestionType } from '@secure-exam/types';
import { QuestionForm } from '../question-bank/QuestionForm';
import { createFakeApi, seedState } from '../testing/fakeApi';
import { renderWithApi } from './render';

const typeSelect = () => screen.getByLabelText('Type') as HTMLSelectElement;
const topicSelect = () => screen.getByLabelText('Topic') as HTMLSelectElement;
/** Picks a topic once the topic list has loaded. */
async function chooseTopic(value: string) {
  await screen.findByRole('option', { name: 'Loops' });
  fireEvent.change(topicSelect(), { target: { value } });
}

describe('QuestionForm (create)', () => {
  it('blocks saving an MCQ until it has text, filled options and one correct answer', async () => {
    const api = createFakeApi();
    const create = vi.spyOn(api, 'createBankQuestion');
    renderWithApi(<QuestionForm onSaved={vi.fn()} onCancel={vi.fn()} />, api);

    fireEvent.click(screen.getByRole('button', { name: 'Create question' }));
    expect(await screen.findByText('Question text is required.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Capital of France?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create question' }));
    expect(await screen.findByText('Choose a topic, or Uncategorised.')).toBeTruthy();

    await chooseTopic('topic-loops');
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
    await chooseTopic('topic-loops');
    fireEvent.click(screen.getByRole('button', { name: 'Create question' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Capital of France?',
        topicId: 'topic-loops',
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
    await chooseTopic(NO_TOPIC);
    fireEvent.click(screen.getByRole('button', { name: 'Create question' }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    const body = create.mock.calls[0][0];
    expect(body.topicId).toBeNull(); // "Uncategorised"
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

describe('QuestionForm (coding languages, #16)', () => {
  it('saves the allowed languages and the reference solution language', async () => {
    const api = createFakeApi();
    const create = vi.spyOn(api, 'createBankQuestion');
    renderWithApi(<QuestionForm onSaved={vi.fn()} onCancel={vi.fn()} />, api);

    fireEvent.change(typeSelect(), { target: { value: QuestionType.CODING } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Sum' } });
    fireEvent.change(screen.getByLabelText('Problem statement'), { target: { value: 'Add two numbers.' } });
    fireEvent.change(screen.getByLabelText('Test 1 input'), { target: { value: '1 2' } });
    fireEvent.change(screen.getByLabelText('Test 1 expected output'), { target: { value: '3' } });
    fireEvent.click(screen.getByLabelText('C++ 17 (g++)'));
    fireEvent.click(screen.getByLabelText('Java 21'));
    fireEvent.click(screen.getByLabelText('Python 3.12')); // students: C++ and Java only
    // The starter tab follows the language just added.
    fireEvent.change(await screen.findByLabelText('Starter code (Java)'), { target: { value: 'public class Main {}' } });
    fireEvent.change(screen.getByLabelText('Reference solution language'), { target: { value: CodeLanguage.CPP } });
    fireEvent.change(screen.getByLabelText('Reference solution'), { target: { value: 'int main(){}' } });
    await chooseTopic(NO_TOPIC);
    fireEvent.click(screen.getByRole('button', { name: 'Create question' }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0].coding).toMatchObject({
      allowedLanguages: [CodeLanguage.CPP, CodeLanguage.JAVA],
      referenceLanguage: CodeLanguage.CPP,
      referenceSolution: 'int main(){}',
      starterCode: expect.objectContaining({ [CodeLanguage.JAVA]: 'public class Main {}' }),
    });
  });

  it('keeps at least one language', () => {
    renderWithApi(<QuestionForm onSaved={vi.fn()} onCancel={vi.fn()} />, createFakeApi());
    fireEvent.change(typeSelect(), { target: { value: QuestionType.CODING } });
    expect((screen.getByLabelText('Python 3.12') as HTMLInputElement).disabled).toBe(true);
  });
});

describe('QuestionForm (edit)', () => {
  it('shows an existing question without a topic as Uncategorised, and saves it that way', async () => {
    const state = seedState();
    const api = createFakeApi(state);
    const replace = vi.spyOn(api, 'replaceBankQuestion');
    const noTopic = state.questions.find((q) => !q.topicId)!;
    renderWithApi(<QuestionForm questionId={noTopic.id} onSaved={vi.fn()} onCancel={vi.fn()} />, api);

    await screen.findByLabelText('Question');
    expect(topicSelect().value).toBe(NO_TOPIC);
    fireEvent.click(screen.getByRole('button', { name: 'Save question' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(noTopic.id, expect.objectContaining({ topicId: null })));
  });

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
