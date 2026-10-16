import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CodeRunKind } from '@secure-exam/types';
import { CodingQuestionView } from '../coding/CodingQuestionView';
import { createFakeApi, httpError, publicCodingQuestion, seedState } from '../testing/fakeApi';
import { renderWithApi } from './render';

function setup(props: Partial<Parameters<typeof CodingQuestionView>[0]> = {}) {
  const state = seedState();
  const api = createFakeApi(state);
  const question = publicCodingQuestion(state);
  const onSaveDraft = vi.fn();
  renderWithApi(
    <CodingQuestionView attemptId="att-1" question={question} onSaveDraft={onSaveDraft} draftDelayMs={10} {...props} />,
    api,
  );
  return { api, question, onSaveDraft };
}

const editor = () => screen.getByLabelText('Code editor') as HTMLTextAreaElement;

describe('CodingQuestionView', () => {
  it('shows the statement, limits and sample tests, starting from the starter code', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Sum of a list' })).toBeTruthy();
    expect(screen.getByText(/time limit 2 s per test/)).toBeTruthy();
    expect(screen.getByText('Input 2')).toBeTruthy();
    expect(editor().value).toBe('nums = list(map(int, input().split()))\n');
  });

  it('prefers the saved draft over the starter code', () => {
    setup({ savedCode: 'print(42)' });
    expect(editor().value).toBe('print(42)');
  });

  it('runs with custom input and shows the output', async () => {
    const { api } = setup();
    const spy = vi.spyOn(api, 'runCode');
    fireEvent.change(screen.getByLabelText('Custom input'), { target: { value: '5 6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByTestId('run-result')).toBeTruthy();
    expect(spy).toHaveBeenCalledWith('att-1', expect.objectContaining({ kind: CodeRunKind.CUSTOM, stdin: '5 6' }));
    expect(screen.getByText(/stdin was: 5 6/)).toBeTruthy();
  });

  it('runs the samples and shows a verdict for each', async () => {
    setup();
    fireEvent.change(editor(), { target: { value: 'print(sum(map(int, input().split())))' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run samples' }));
    const result = await screen.findByTestId('samples-result');
    expect(result.textContent).toContain('Sample 1');
    expect(result.textContent).toContain('Sample 2');
    expect(screen.getAllByText('Passed')).toHaveLength(2);
  });

  it('submits and shows the score with sample/hidden labels', async () => {
    setup();
    fireEvent.change(editor(), { target: { value: 'print(sum(map(int, input().split())))' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    const result = await screen.findByTestId('submit-result');
    expect(result.textContent).toContain('Score 10 / 10');
    expect(result.textContent).toContain('Sample 1');
    expect(result.textContent).toContain('Test 3');
    expect(screen.getByText('Last submission: 10 / 10')).toBeTruthy();
  });

  it('shows the server message on 429 (run already in progress)', async () => {
    const { api } = setup();
    vi.spyOn(api, 'runCode').mockRejectedValue(httpError(429, 'Your previous run is still in progress'));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText('Your previous run is still in progress')).toBeTruthy();
  });

  it('explains that the attempt ended on 409 from submit', async () => {
    const { api } = setup();
    vi.spyOn(api, 'submitCode').mockRejectedValue(
      httpError(409, 'The attempt ended before your submission finished, so it was not counted'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText(/was not counted/)).toBeTruthy();
  });

  it('disables Run and Submit while offline, but keeps saving drafts', async () => {
    const { onSaveDraft } = setup({ online: false });
    expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/You are offline/)).toBeTruthy();
    fireEvent.change(editor(), { target: { value: 'print(1)' } });
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledWith('print(1)'));
  });

  it('disables actions when the code is over the length limit', () => {
    setup();
    fireEvent.change(editor(), { target: { value: 'x'.repeat(10_001) } });
    expect((screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/longer than 10,000 characters/)).toBeTruthy();
  });

  it('never renders statement links as navigable anchors', () => {
    const state = seedState();
    const question = publicCodingQuestion(state);
    question.coding!.statementMd = 'See [docs](https://evil.example) and <script>alert(1)</script>';
    renderWithApi(<CodingQuestionView attemptId="a" question={question} onSaveDraft={vi.fn()} />, createFakeApi(state));
    expect(document.querySelector('a[href]')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText('docs')).toBeTruthy();
  });

  it('blocks pasting text copied outside the editor in exam mode', () => {
    const onBlockedPaste = vi.fn();
    setup({ onBlockedPaste });
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => 'copied from the web' } });
    act(() => void editor().dispatchEvent(paste));
    expect(paste.defaultPrevented).toBe(true);
    expect(onBlockedPaste).toHaveBeenCalled();
    expect(screen.getByText(/Pasting text from outside the editor is not allowed/)).toBeTruthy();
  });
});
