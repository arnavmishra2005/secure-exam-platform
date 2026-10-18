import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CodeRunKind, CodingGradingMode, type CodingClientConfig, type LocalRunner } from '@secure-exam/types';
import { CodingQuestionView } from '../coding/CodingQuestionView';
import { createFakeApi, createFakeLocalRunner, httpError, publicCodingQuestion, seedState } from '../testing/fakeApi';
import { renderWithApi } from './render';

const SUM = 'print(sum(map(int, input().split())))';

function setup(
  props: Partial<Parameters<typeof CodingQuestionView>[0]> = {},
  config: Partial<CodingClientConfig> = {},
) {
  const state = seedState();
  const api = createFakeApi(state, { config });
  const question = publicCodingQuestion(state);
  const onSaveDraft = vi.fn();
  renderWithApi(
    <CodingQuestionView attemptId="att-1" question={question} onSaveDraft={onSaveDraft} draftDelayMs={10} {...props} />,
    api,
  );
  return { api, question, onSaveDraft };
}

const editor = () => screen.getByLabelText('Code editor') as HTMLTextAreaElement;
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
const enabled = (name: string) => waitFor(() => expect(button(name).disabled).toBe(false));

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

  describe('with a local runner (exam app)', () => {
    it('runs custom input on this PC, without calling the server', async () => {
      const localRunner = createFakeLocalRunner();
      const spy = vi.spyOn(localRunner, 'run');
      const { api } = setup({ localRunner });
      const server = vi.spyOn(api, 'runCode');
      fireEvent.change(editor(), { target: { value: SUM } });
      fireEvent.change(screen.getByLabelText('Custom input'), { target: { value: '5 6' } });
      fireEvent.click(button('Run'));
      expect(await screen.findByTestId('run-result')).toBeTruthy();
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ code: SUM, inputs: ['5 6'], timeLimitMs: 2000, memoryLimitMb: 256 }));
      expect(server).not.toHaveBeenCalled();
      expect(screen.getByText('11')).toBeTruthy();
      expect(screen.queryByText(/ran on the server/)).toBeNull();
    });

    it('checks the samples locally with the server\'s comparison rule', async () => {
      setup({ localRunner: createFakeLocalRunner() });
      fireEvent.change(editor(), { target: { value: SUM } });
      fireEvent.click(button('Run samples'));
      const result = await screen.findByTestId('samples-result');
      expect(result.textContent).toContain('Sample 2');
      expect(screen.getAllByText('Passed')).toHaveLength(2);
    });

    it('falls back to the server when the local runner itself fails and the server allows it', async () => {
      const { api } = setup({ localRunner: createFakeLocalRunner() }, { serverRunEnabled: true });
      const server = vi.spyOn(api, 'runCode');
      fireEvent.change(editor(), { target: { value: 'print(1)  # crash-runner' } });
      fireEvent.click(button('Run'));
      expect(await screen.findByText(/ran on the server/)).toBeTruthy();
      expect(server).toHaveBeenCalledWith('att-1', expect.objectContaining({ kind: CodeRunKind.CUSTOM }));
    });

    it('explains the problem when the local runner fails and server runs are off', async () => {
      const { api } = setup({ localRunner: createFakeLocalRunner() }, { serverRunEnabled: false });
      const server = vi.spyOn(api, 'runCode');
      fireEvent.change(editor(), { target: { value: 'print(1)  # crash-runner' } });
      fireEvent.click(button('Run'));
      expect(await screen.findByText(/This computer couldn't run your code \(python3 not found\)/)).toBeTruthy();
      expect(server).not.toHaveBeenCalled();
    });

    it('keeps Run working offline, but not Submit', async () => {
      const { onSaveDraft } = setup({ localRunner: createFakeLocalRunner(), online: false });
      expect(button('Run').disabled).toBe(false);
      expect(button('Submit').disabled).toBe(true);
      fireEvent.change(editor(), { target: { value: 'print(1)' } });
      await waitFor(() => expect(onSaveDraft).toHaveBeenCalledWith('print(1)'));
    });
  });

  describe('without a local runner', () => {
    it('runs on the server when the server allows it (development)', async () => {
      const { api } = setup({}, { serverRunEnabled: true });
      const server = vi.spyOn(api, 'runCode');
      await enabled('Run');
      fireEvent.click(button('Run'));
      expect(await screen.findByText(/ran on the server/)).toBeTruthy();
      expect(server).toHaveBeenCalled();
    });

    it('disables Run when server runs are off (production)', async () => {
      setup({}, { serverRunEnabled: false });
      expect(await screen.findByText(/Running code isn't available on this computer/)).toBeTruthy();
      expect(button('Run').disabled).toBe(true);
      expect(button('Run samples').disabled).toBe(true);
      expect(button('Submit').disabled).toBe(false);
    });

    it('shows the server message on 429', async () => {
      const { api } = setup({}, { serverRunEnabled: true });
      vi.spyOn(api, 'runCode').mockRejectedValue(httpError(429, 'Your previous run is still in progress'));
      await enabled('Run');
      fireEvent.click(button('Run'));
      expect(await screen.findByText('Your previous run is still in progress')).toBeTruthy();
    });
  });

  describe('Submit', () => {
    it('saves the code as the final answer with no score (deferred grading)', async () => {
      const { api } = setup();
      const spy = vi.spyOn(api, 'submitCode');
      fireEvent.change(editor(), { target: { value: SUM } });
      fireEvent.click(button('Submit'));
      expect(await screen.findByText(/Saved as your final answer at/)).toBeTruthy();
      expect(screen.getByText(/graded on all test cases after the exam/)).toBeTruthy();
      expect(spy).toHaveBeenCalledWith('att-1', expect.objectContaining({ code: SUM }));
      expect(screen.queryByText(/Score/)).toBeNull();
      expect(screen.getByText(/^Submitted /)).toBeTruthy();
    });

    it('shows the score when the server grades live', async () => {
      setup({}, { gradingMode: CodingGradingMode.LIVE });
      fireEvent.change(editor(), { target: { value: SUM } });
      fireEvent.click(button('Submit'));
      const result = await screen.findByTestId('submit-result');
      expect(result.textContent).toContain('Score 10 / 10');
      expect(result.textContent).toContain('Test 3');
    });

    it('explains that the attempt ended on 409', async () => {
      const { api } = setup();
      vi.spyOn(api, 'submitCode').mockRejectedValue(httpError(409, 'This attempt has already been submitted'));
      fireEvent.click(button('Submit'));
      expect(await screen.findByText('This attempt has already been submitted')).toBeTruthy();
    });
  });

  it('disables actions when the code is over the length limit', () => {
    setup({ localRunner: createFakeLocalRunner() });
    fireEvent.change(editor(), { target: { value: 'x'.repeat(10_001) } });
    expect(button('Submit').disabled).toBe(true);
    expect(button('Run').disabled).toBe(true);
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

describe('desktopLocalRunner', () => {
  it('uses window.desktop.runCode when the exam app provides it', async () => {
    const { desktopLocalRunner } = await import('../coding/localRunner');
    expect(desktopLocalRunner()).toBeUndefined();
    const run = vi.fn().mockResolvedValue([]);
    window.desktop = { runCode: run as LocalRunner['run'] };
    await desktopLocalRunner()!.run({ language: 'python' as never, code: 'x', inputs: [], timeLimitMs: 1, memoryLimitMb: 1, outputLimitBytes: 1 });
    expect(run).toHaveBeenCalled();
    delete window.desktop;
  });
});
