import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CODE_LANGUAGES,
  CodeLanguage,
  CodeRunKind,
  CodeSubmissionStatus,
  CodingGradingMode,
  encodeCodeDraft,
  ExecutionStatus,
  type CodingClientConfig,
  type LocalRunner,
} from '@secure-exam/types';
import { CodingQuestionView } from '../coding/CodingQuestionView';
import { createFakeApi, createFakeLocalRunner, httpError, publicCodingQuestion, seedState } from '../testing/fakeApi';
import { renderWithApi } from './render';

const SUM = 'print(sum(map(int, input().split())))';

function setup(
  props: Partial<Parameters<typeof CodingQuestionView>[0]> = {},
  config: Partial<CodingClientConfig> = {},
  allowedLanguages?: CodeLanguage[],
) {
  const state = seedState();
  const api = createFakeApi(state, { config });
  const base = publicCodingQuestion(state);
  const question = allowedLanguages ? { ...base, coding: { ...base.coding!, allowedLanguages } } : base;
  const onSaveDraft = vi.fn();
  const rendered = renderWithApi(
    <CodingQuestionView attemptId="att-1" question={question} onSaveDraft={onSaveDraft} draftDelayMs={10} {...props} />,
    api,
  );
  return { api, question, onSaveDraft, ...rendered };
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

  it('asks in the page before Reset replaces edited code with the starter code', () => {
    const confirm = vi.spyOn(window, 'confirm');
    setup();
    const starter = editor().value;
    fireEvent.change(editor(), { target: { value: 'print(99)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep my code' }));
    expect(editor().value).toBe('print(99)');
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace with starter code' }));
    expect(editor().value).toBe(starter);
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('prefers the saved draft over the starter code', () => {
    setup({ savedCode: 'print(42)' });
    expect(editor().value).toBe('print(42)');
  });

  describe('languages (#16)', () => {
    const picker = () => screen.getByLabelText('Language') as HTMLSelectElement;

    it('sizes the picker with one consistent padding, so its text is not cut off', () => {
      setup({}, {}, [CodeLanguage.PYTHON, CodeLanguage.JAVA]);
      const classes = picker().className.split(/\s+/);
      expect(classes).toContain('py-1');
      expect(classes).not.toContain('py-2');
      expect(classes.some((c) => /^h-\d/.test(c))).toBe(false);
    });

    it('shows the only allowed language without a picker', () => {
      setup();
      expect(screen.queryByLabelText('Language')).toBeNull();
      expect(screen.getByText('Python 3.12')).toBeTruthy();
    });

    it('switches to C++ with its default template and saves the draft with its language', async () => {
      const { onSaveDraft } = setup({}, {}, [CodeLanguage.PYTHON, CodeLanguage.CPP]);
      expect([...picker().options].map((o) => o.textContent)).toEqual(['Python 3.12', 'C++ 17 (g++)']);
      fireEvent.change(picker(), { target: { value: CodeLanguage.CPP } }); // starter unchanged: no question asked
      expect(editor().value).toBe(CODE_LANGUAGES[CodeLanguage.CPP].defaultStarter);
      fireEvent.change(editor(), { target: { value: 'int main(){}' } });
      await waitFor(() => expect(onSaveDraft).toHaveBeenLastCalledWith(encodeCodeDraft(CodeLanguage.CPP, 'int main(){}')));
    });

    it('resumes a saved C++ draft in C++', () => {
      setup({ savedCode: encodeCodeDraft(CodeLanguage.CPP, 'int main(){ return 0; }') }, {}, [CodeLanguage.PYTHON, CodeLanguage.CPP]);
      expect(picker().value).toBe(CodeLanguage.CPP);
      expect(editor().value).toBe('int main(){ return 0; }');
    });

    it('asks in the page (not a native dialog) before switching away from edited code, and keeps it for switching back', () => {
      // A native OS dialog takes focus from the exam window and is recorded as a violation.
      const confirm = vi.spyOn(window, 'confirm');
      setup({}, {}, [CodeLanguage.PYTHON, CodeLanguage.JAVA]);
      fireEvent.change(editor(), { target: { value: 'print(7)' } });

      fireEvent.change(picker(), { target: { value: CodeLanguage.JAVA } });
      expect(screen.getByRole('dialog', { name: 'Switch to Java?' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Keep Python' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(picker().value).toBe(CodeLanguage.PYTHON);
      expect(editor().value).toBe('print(7)');

      fireEvent.change(picker(), { target: { value: CodeLanguage.JAVA } });
      fireEvent.click(screen.getByRole('button', { name: 'Switch to Java' }));
      expect(picker().value).toBe(CodeLanguage.JAVA);
      expect(editor().value).toContain('public class Main');
      fireEvent.change(picker(), { target: { value: CodeLanguage.PYTHON } }); // Java template unchanged: no question
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(editor().value).toBe('print(7)');
      expect(confirm).not.toHaveBeenCalled();
      confirm.mockRestore();
    });

    it('closes the language question with Escape and stays in the current language', () => {
      setup({}, {}, [CodeLanguage.PYTHON, CodeLanguage.JAVA]);
      fireEvent.change(editor(), { target: { value: 'print(7)' } });
      fireEvent.change(picker(), { target: { value: CodeLanguage.JAVA } });
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(picker().value).toBe(CodeLanguage.PYTHON);
    });

    it('saves (and so grades, if drafts count) the language last typed in, not just the one picked', async () => {
      const onCodeChange = vi.fn();
      const { onSaveDraft } = setup({ onCodeChange }, {}, [CodeLanguage.PYTHON, CodeLanguage.JAVA]);
      fireEvent.change(editor(), { target: { value: 'print(7)' } });
      await waitFor(() => expect(onSaveDraft).toHaveBeenLastCalledWith('print(7)'));

      // Picking Java to look at it keeps the Python work as the saved answer.
      fireEvent.change(picker(), { target: { value: CodeLanguage.JAVA } });
      fireEvent.click(screen.getByRole('button', { name: 'Switch to Java' }));
      expect(editor().value).toContain('public class Main');
      await new Promise((r) => setTimeout(r, 30));
      expect(onSaveDraft).toHaveBeenLastCalledWith('print(7)');
      expect(onCodeChange).toHaveBeenLastCalledWith('print(7)');

      // Typing in Java makes the Java code the saved answer.
      fireEvent.change(editor(), { target: { value: 'class Main {}' } });
      await waitFor(() => expect(onSaveDraft).toHaveBeenLastCalledWith(encodeCodeDraft(CodeLanguage.JAVA, 'class Main {}')));
    });

    it('moves the saved answer to the submitted language on Submit', async () => {
      const onCodeChange = vi.fn();
      const { api } = setup({ onCodeChange }, {}, [CodeLanguage.PYTHON, CodeLanguage.C]);
      fireEvent.change(editor(), { target: { value: 'print(7)' } });
      fireEvent.change(picker(), { target: { value: CodeLanguage.C } });
      fireEvent.click(screen.getByRole('button', { name: 'Switch to C' }));
      const submit = vi.spyOn(api, 'submitCode');
      await enabled('Submit');
      fireEvent.click(button('Submit'));
      await waitFor(() => expect(submit).toHaveBeenCalledWith('att-1', expect.objectContaining({ language: CodeLanguage.C })));
      await waitFor(() =>
        expect(onCodeChange).toHaveBeenLastCalledWith(encodeCodeDraft(CodeLanguage.C, CODE_LANGUAGES[CodeLanguage.C].defaultStarter)),
      );
    });

    it('runs and submits in the selected language', async () => {
      const localRunner = createFakeLocalRunner();
      const run = vi.spyOn(localRunner, 'run');
      const { api } = setup({ localRunner }, {}, [CodeLanguage.PYTHON, CodeLanguage.C]);
      const submit = vi.spyOn(api, 'submitCode');
      fireEvent.change(picker(), { target: { value: CodeLanguage.C } });
      fireEvent.click(button('Run'));
      await waitFor(() => expect(run).toHaveBeenCalledWith(expect.objectContaining({ language: CodeLanguage.C })));
      await enabled('Submit');
      fireEvent.click(button('Submit'));
      await waitFor(() => expect(submit).toHaveBeenCalledWith('att-1', expect.objectContaining({ language: CodeLanguage.C })));
    });
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

    it('confirms the submitted snapshot even after navigating away while Submit is in flight', async () => {
      const onSubmitted = vi.fn();
      const { api, unmount } = setup({ onSubmitted });
      let resolve!: (value: any) => void;
      vi.spyOn(api, 'submitCode').mockImplementation(() => new Promise(done => { resolve = done; }));
      fireEvent.change(editor(), { target: { value: SUM } });
      fireEvent.click(button('Submit'));
      await waitFor(() => expect(resolve).toBeTypeOf('function'));
      fireEvent.change(editor(), { target: { value: 'new draft' } });
      unmount();
      const result = { submissionId: 'saved', savedAt: new Date().toISOString(), status: CodeSubmissionStatus.PENDING };
      await act(async () => resolve(result));
      expect(onSubmitted).toHaveBeenCalledWith(SUM, result, CodeLanguage.PYTHON);
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
    window.desktop = { isDesktop: () => true, runCode: run as LocalRunner['run'] };
    await desktopLocalRunner()!.run({ language: 'python' as never, code: 'x', inputs: [], timeLimitMs: 1, memoryLimitMb: 1, outputLimitBytes: 1 });
    expect(run).toHaveBeenCalled();
    delete window.desktop;
  });
});

describe('CodingQuestionView error messages (desktop runner)', () => {
  const rawRunner = (stderr: string): LocalRunner => ({
    run: async (job) =>
      job.inputs.map(() => ({ status: ExecutionStatus.RUNTIME_ERROR, stdout: '', stderr, exitCode: 1, timeMs: 5 })),
  });

  it('names a syntax error and its line, with the raw output folded away', async () => {
    const stderr = `  File "/sandbox/main.py", line 3\n    x = (1,\n        ^\nSyntaxError: '(' was never closed\n`;
    setup({ localRunner: rawRunner(stderr) });
    fireEvent.change(editor(), { target: { value: 'x = (1,' } });
    fireEvent.click(button('Run'));
    const error = await screen.findByTestId('run-error');
    expect(error.textContent).toContain('Syntax error on line 3');
    expect(screen.getByText('Compilation error')).toBeTruthy();
    expect(screen.getByText('Full error output').closest('details')?.textContent).toContain('was never closed');
  });

  it('labels each failing sample with the kind of runtime error', async () => {
    const stderr = 'Traceback (most recent call last):\n  File "/sandbox/main.py", line 2, in <module>\n    print(nums[5])\nIndexError: list index out of range\n';
    setup({ localRunner: rawRunner(stderr) });
    fireEvent.change(editor(), { target: { value: SUM } });
    fireEvent.click(button('Run samples'));
    await screen.findByTestId('samples-result');
    expect(screen.getAllByText('Index error on line 2')).toHaveLength(2);
    expect(screen.getAllByText('Runtime error')).toHaveLength(2);
  });
});
