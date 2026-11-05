import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { NO_TOPIC, QuestionStatus, QuestionType, type BankQuestionQuery } from '@secure-exam/types';
import { ALL_TOPICS, bankQueryFromParams, bankQueryToParams, toApiQuery } from '../question-bank/bankQuery';
import { PickForExamDialog } from '../question-bank/PickForExamDialog';
import { QuestionBankPage } from '../question-bank/QuestionBankPage';
import { createFakeApi, seedState } from '../testing/fakeApi';
import { renderWithApi } from './render';

const page = (api = createFakeApi(), props: Partial<Parameters<typeof QuestionBankPage>[0]> = {}) =>
  renderWithApi(<QuestionBankPage onCreate={vi.fn()} onEdit={vi.fn()} {...props} />, api);

const topicCard = async (name: RegExp) => within(screen.getByRole('navigation', { name: 'Topics' })).findByRole('button', { name });

describe('QuestionBankPage', () => {
  it('starts with topic cards and their counts, and loads no list yet', async () => {
    const api = createFakeApi();
    const list = vi.spyOn(api, 'listBankQuestions');
    page(api);
    await waitFor(async () => expect((await topicCard(/All questions/)).textContent).toContain('4 questions'));
    const loops = await topicCard(/Loops/);
    expect(loops.textContent).toContain('1 question');
    expect((await topicCard(/Lists/)).textContent).toMatch(/2 questions.*T\/F 1.*Coding 1/);
    expect((await topicCard(/Uncategorised/)).textContent).toContain('1 question');
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });

  it('opens All questions: type cards and the whole list, without a topic filter', async () => {
    const api = createFakeApi();
    const list = vi.spyOn(api, 'listBankQuestions');
    page(api);
    fireEvent.click(await topicCard(/All questions/));
    expect(await screen.findByText('Sum of a list')).toBeTruthy();
    expect(screen.getByText('Locked')).toBeTruthy();
    expect(screen.getByText('1–4 of 4')).toBeTruthy();
    expect(list.mock.lastCall![0].topicId).toBeUndefined();
  });

  it('opens a topic and shows the counts per type in its type cards', async () => {
    const api = createFakeApi();
    const list = vi.spyOn(api, 'listBankQuestions');
    page(api);
    fireEvent.click(await topicCard(/Lists/));

    await waitFor(() => expect(screen.getByText('1–2 of 2')).toBeTruthy());
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ topicId: 'topic-lists', page: 1 }));
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent).toContain('Lists');
    expect(screen.getByRole('tab', { name: /^All types/ }).textContent).toBe('All types2 questions');
    expect(screen.getByRole('tab', { name: /^True \/ False/ }).textContent).toBe('True / False1 question');
    expect(screen.getByRole('tab', { name: /^Coding/ }).textContent).toBe('Coding1 question');
    expect(screen.getByRole('tab', { name: /^Single choice/ }).textContent).toBe('Single choice0 questions');
  });

  it('filters by type through the type cards, and goes back to the topic cards', async () => {
    const api = createFakeApi();
    const list = vi.spyOn(api, 'listBankQuestions');
    page(api);
    fireEvent.click(await topicCard(/All questions/));
    await screen.findByText('Sum of a list');
    fireEvent.click(screen.getByRole('tab', { name: /^Coding/ }));
    await waitFor(() => expect(screen.getByText('1–1 of 1')).toBeTruthy());
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ type: QuestionType.CODING, page: 1 }));
    expect(screen.getByRole('tab', { name: /^Coding/ }).getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: '← Topics' }));
    expect(await topicCard(/Loops/)).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('shows questions without a topic under Uncategorised', async () => {
    const api = createFakeApi();
    const list = vi.spyOn(api, 'listBankQuestions');
    page(api);
    fireEvent.click(await topicCard(/Uncategorised/));
    expect(await screen.findByText('Which of these are immutable?')).toBeTruthy();
    expect(screen.queryByText('Sum of a list')).toBeNull();
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ topicId: NO_TOPIC }));
  });

  it('creates a topic from the + New topic card and opens it', async () => {
    const api = createFakeApi();
    const create = vi.spyOn(api, 'createTopic');
    page(api);
    fireEvent.click(await screen.findByRole('button', { name: '+ New topic' }));
    fireEvent.change(screen.getByLabelText('New topic name'), { target: { value: '  Binary search ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: 'Binary search', courseId: null }));
    expect(await screen.findByText('No questions match')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent).toContain('Binary search'));
  });

  it('goes back to page 1 on any filter change and keeps the other filters (host-controlled query)', async () => {
    const onQueryChange = vi.fn();
    const query: BankQuestionQuery = { page: 3, limit: 1, topicId: 'topic-lists', type: QuestionType.CODING, search: 'sum' };
    page(createFakeApi(), { query, onQueryChange });
    fireEvent.change(await screen.findByLabelText('Difficulty'), { target: { value: 'EASY' } });
    expect(onQueryChange).toHaveBeenLastCalledWith({ ...query, difficulty: 'EASY', page: 1 });
    fireEvent.click(screen.getByRole('tab', { name: /^All types/ }));
    expect(onQueryChange).toHaveBeenLastCalledWith({ ...query, type: undefined, page: 1 });
    fireEvent.click(screen.getByRole('button', { name: '← Topics' }));
    expect(onQueryChange).toHaveBeenLastCalledWith({ ...query, topicId: undefined, type: undefined, page: 1 });
  });

  it('keeps All questions open when the course changes', async () => {
    const onQueryChange = vi.fn();
    const query: BankQuestionQuery = { page: 1, limit: 20, topicId: ALL_TOPICS };
    page(createFakeApi(), { query, onQueryChange, courses: [{ id: 'c-1', name: 'CS101' }] });
    fireEvent.change(await screen.findByLabelText('Course'), { target: { value: 'c-1' } });
    expect(onQueryChange).toHaveBeenLastCalledWith({ ...query, courseId: 'c-1', page: 1 });
  });

  it('shows the search from the query when it changes from outside (Back)', async () => {
    const onQueryChange = vi.fn();
    function Host() {
      const [query, setQuery] = useState<BankQuestionQuery>({ page: 1, limit: 20, topicId: ALL_TOPICS, search: 'list' });
      return (
        <>
          <button type="button" onClick={() => setQuery({ page: 1, limit: 20, topicId: ALL_TOPICS })}>
            Back
          </button>
          <QuestionBankPage onCreate={vi.fn()} onEdit={vi.fn()} query={query} onQueryChange={onQueryChange} />
        </>
      );
    }
    renderWithApi(<Host />, createFakeApi());
    const search = screen.getByLabelText('Search questions') as HTMLInputElement;
    expect(search.value).toBe('list');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(search.value).toBe('');
    // The debounce must not put the old search back.
    await new Promise((r) => setTimeout(r, 350));
    expect(onQueryChange).not.toHaveBeenCalled();
  });
});

describe('bank filters in the URL', () => {
  it('round-trips every filter and leaves out defaults', () => {
    const query: BankQuestionQuery = {
      search: 'sum',
      courseId: 'c-1',
      topicId: NO_TOPIC,
      tag: 'lists',
      type: QuestionType.CODING,
      difficulty: 'HARD' as never,
      status: QuestionStatus.READY,
      page: 2,
      limit: 20,
    };
    const params = bankQueryToParams(query);
    expect(params.toString()).toBe('search=sum&courseId=c-1&topicId=none&tag=lists&type=CODING&difficulty=HARD&status=READY&page=2');
    expect(bankQueryFromParams(params)).toEqual(query);
    expect(bankQueryToParams({ page: 1, limit: 20 }).toString()).toBe('');
  });

  it('keeps the open All questions card in the URL but never sends it to the API', () => {
    const query = bankQueryFromParams(new URLSearchParams('topicId=all&type=CODING'));
    expect(query).toEqual({ page: 1, limit: 20, topicId: ALL_TOPICS, type: QuestionType.CODING });
    expect(toApiQuery(query)).toEqual({ page: 1, limit: 20, type: QuestionType.CODING });
  });

  it('ignores unknown values', () => {
    expect(bankQueryFromParams(new URLSearchParams('type=ESSAY&difficulty=x&status=&page=-3&search=%20%20'))).toEqual({
      page: 1,
      limit: 20,
    });
  });
});

describe('PickForExamDialog', () => {
  it('offers Uncategorised as a topic filter, still hiding questions already in the exam', async () => {
    const api = createFakeApi();
    const list = vi.spyOn(api, 'listBankQuestions');
    renderWithApi(<PickForExamDialog examId="exam-demo" open onClose={vi.fn()} />, api);
    await screen.findByText('Sum of a list');
    fireEvent.change(screen.getByLabelText('Topic'), { target: { value: NO_TOPIC } });
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ topicId: NO_TOPIC, excludeExamId: 'exam-demo', status: QuestionStatus.READY, page: 1 }),
      ),
    );
  });

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
