import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuestionsTab } from '../results/QuestionsTab';
import { matrixToCsv } from '../results/csv';
import { createFakeApi, fakeAnalytics, httpError, seedState } from '../testing/fakeApi';
import { renderWithApi } from './render';

describe('QuestionsTab', () => {
  it('shows per-question stats and the who-answered-what matrix', async () => {
    renderWithApi(<QuestionsTab examId="exam-demo" />, createFakeApi());

    expect(await screen.findByText('3 attempts · 3 questions')).toBeTruthy();
    const matrix = screen.getByRole('table', { name: 'Who answered what' });
    expect(within(matrix).getByText('Alice Johnson')).toBeTruthy();
    // Partial coding cell shows the score; others show symbols with full descriptions.
    expect(within(matrix).getByLabelText('Alice Johnson, Q3: Partly correct · 6.67/10').textContent).toBe('6.67');
    expect(within(matrix).getByLabelText('Bob Smith, Q1: Correct · 1/1').textContent).toBe('✓');
    expect(within(matrix).getByLabelText('Carol Williams, Q3: Not graded yet')).toBeTruthy();
    expect(within(matrix).getByLabelText('Carol Williams, Q1: Not answered · 0/1 · marked for review')).toBeTruthy();
    expect(within(matrix).getByText('7.67 / 12')).toBeTruthy();
    expect(screen.getByText('83%')).toBeTruthy(); // coding test pass rate
  });

  it('expands an MCQ to show how many students chose each option', async () => {
    const state = seedState();
    renderWithApi(<QuestionsTab examId="exam-demo" />, createFakeApi(state));
    fireEvent.click(await screen.findByRole('button', { name: state.questions[0].text }));
    expect(screen.getByText('2 chose it')).toBeTruthy();
    expect(screen.getByTitle('for').textContent).toBe('✓ for');
  });

  it('filters students by name or email', async () => {
    renderWithApi(<QuestionsTab examId="exam-demo" />, createFakeApi());
    const matrix = await screen.findByRole('table', { name: 'Who answered what' });
    fireEvent.change(screen.getByLabelText('Search students'), { target: { value: 'bob@' } });
    expect(within(matrix).queryByText('Alice Johnson')).toBeNull();
    expect(within(matrix).getByText('Bob Smith')).toBeTruthy();
  });

  it('opens a drill-down with selected options and the submitted code with test results', async () => {
    const api = createFakeApi();
    const spy = vi.spyOn(api, 'getAttemptDrilldown');
    renderWithApi(<QuestionsTab examId="exam-demo" />, api);
    fireEvent.click(await screen.findByRole('button', { name: /Alice Johnson alice@/ }));

    const dialog = await screen.findByRole('dialog');
    expect(spy).toHaveBeenCalledWith('exam-demo', 'att-1');
    expect(await within(dialog).findByText(/Last submission before the end/)).toBeTruthy();
    expect(within(dialog).getByText(/2 submits, 5 runs · 2\/3 tests passed/)).toBeTruthy();
    expect(((await within(dialog).findByLabelText('Q3 submitted code')) as HTMLTextAreaElement).value).toContain('print(sum(');
    expect(within(dialog).getAllByText('Correct answer').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Wrong answer')).toBeTruthy(); // hidden test 3 verdict
  });

  it('shows an empty state when nobody has started', async () => {
    const api = createFakeApi();
    vi.spyOn(api, 'getQuestionAnalytics').mockImplementation(async () => ({
      ...fakeAnalytics(seedState()),
      students: [],
      cells: [],
    }));
    renderWithApi(<QuestionsTab examId="exam-demo" />, api);
    expect(await screen.findByText('No attempts yet')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Export CSV' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the error with a retry', async () => {
    const api = createFakeApi();
    const spy = vi.spyOn(api, 'getQuestionAnalytics').mockRejectedValueOnce(httpError(404, 'Exam x not found'));
    renderWithApi(<QuestionsTab examId="exam-demo" />, api);
    expect(await screen.findByText(/Exam x not found/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('3 attempts · 3 questions')).toBeTruthy();
  });
});

describe('QuestionsTab recalculation', () => {
  it('asks for confirmation, recalculates, and reports what happened', async () => {
    const api = createFakeApi();
    const spy = vi.spyOn(api, 'recalculateResults');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderWithApi(<QuestionsTab examId="exam-demo" />, api);

    fireEvent.click(await screen.findByRole('button', { name: 'Recalculate results' }));
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Recalculate results' }));
    expect(await screen.findByText(/Recalculated 1 of 2 results; 1 coding answers are being graded again/)).toBeTruthy();
    expect(spy).toHaveBeenCalledWith('exam-demo');
    expect(confirm.mock.calls[0][0]).toMatch(/replaces any score you adjusted by hand/);
    confirm.mockRestore();
  });

  it('shows that grading is still in progress for finished attempts', async () => {
    const api = createFakeApi();
    const m = fakeAnalytics(seedState());
    m.students[2].status = 'SUBMITTED' as never; // Carol finished; her coding answer is still PENDING
    vi.spyOn(api, 'getQuestionAnalytics').mockResolvedValue(m);
    renderWithApi(<QuestionsTab examId="exam-demo" />, api);
    expect(await screen.findByText(/Grading in progress: 1 coding answer from finished attempts/)).toBeTruthy();
  });
});

describe('matrixToCsv', () => {
  it('writes one row per student with score and result per question, quoting where needed', () => {
    const m = fakeAnalytics(seedState());
    m.students[0].fullName = 'Johnson, Alice "AJ"';
    const lines = matrixToCsv(m).trim().split('\n');
    expect(lines[0]).toBe('Student,Email,Status,Score,Max,Q1 score,Q1 result,Q2 score,Q2 result,Q3 score,Q3 result');
    expect(lines[1]).toBe('"Johnson, Alice ""AJ""",alice@secure-exam.dev,SUBMITTED,7.67,12,1,Correct,0,Wrong,6.67,Partly correct');
    expect(lines[3]).toContain(',,Not graded yet');
  });
});
