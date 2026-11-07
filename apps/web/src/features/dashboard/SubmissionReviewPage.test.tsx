import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { getMySubmission } from '@secure-exam/api-client';
import { CodeLanguage, OutputComparisonMode, QuestionType, TestCaseVerdict, encodeCodeDraft, type StudentSubmissionReview } from '@secure-exam/types';
import SubmissionReviewPage from './SubmissionReviewPage';

vi.mock('@secure-exam/api-client', async importOriginal => ({
  ...await importOriginal<typeof import('@secure-exam/api-client')>(), getMySubmission: vi.fn(),
}));
const base: StudentSubmissionReview = {
  examId: 'exam', title: 'Exam', attemptId: 'attempt', submittedAt: '2026-11-04T10:00:00Z', published: false, gradeUnsubmittedCode: false,
  questions: [{ question: { id: 'code', type: QuestionType.CODING, text: 'Code question', marks: 5, createdAt: '2026-11-04T10:00:00Z', updatedAt: '2026-11-04T10:00:00Z', options: [], coding: { statementMd: 'Statement', starterCode: {}, allowedLanguages: [CodeLanguage.PYTHON], timeLimitMs: 2000, memoryLimitMb: 256, comparisonMode: OutputComparisonMode.EXACT, samples: [] } },
    textResponse: 'print("saved draft")', selectedOptionIds: [], markedForReview: false,
    code: { code: '', language: CodeLanguage.PYTHON, fromDraft: true, submittedAt: null } }],
};

function show(data: StudentSubmissionReview) {
  vi.mocked(getMySubmission).mockResolvedValue(data);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><SubmissionReviewPage /></MemoryRouter>
  </QueryClientProvider>);
}

describe('submitted coding answer review', () => {
  it('retains the saved draft when the final zero-score record contains no code', async () => {
    show(base);
    expect((await screen.findByLabelText('Code editor', {}, { timeout: 5000 }) as HTMLTextAreaElement).value).toBe('print("saved draft")');
    expect(screen.queryByText(/Hidden test/)).toBeNull();
  });
  it('shows hidden-test input, expected output, student output and errors in published analysis', async () => {
    show({ ...base, published: true, questions: [{ ...base.questions[0], analysis: {
      score: 0, maxScore: 5, gradingPending: false, reason: 'One test failed',
      tests: [{ index: 1, isSample: false, verdict: TestCaseVerdict.WRONG_ANSWER, timeMs: 2,
        input: 'hidden input', expectedOutput: 'expected value', stdout: 'student output', stderr: 'student error' }],
    } }] });
    expect(await screen.findByText(/Hidden test 1: WRONG ANSWER/)).toBeTruthy();
    for (const text of ['hidden input', 'expected value', 'student output', 'student error']) expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByText('0 / 5 marks')).toBeTruthy();
  });
  it('lists tests that were not run (no code) with their input and expected output', async () => {
    show({ ...base, published: true, questions: [{ ...base.questions[0], textResponse: null, analysis: {
      score: 0, maxScore: 5, gradingPending: false, reason: 'No code was written, so no tests were run',
      tests: [{ index: 1, isSample: false, verdict: null, timeMs: null, input: 'hidden input', expectedOutput: 'expected value' }],
    } }] });
    expect(await screen.findByText('Hidden test 1: Not run')).toBeTruthy();
    expect(screen.getByText('hidden input')).toBeTruthy();
    expect(screen.getByText('expected value')).toBeTruthy();
  });
  it('shows a graded draft in its own language', async () => {
    show({ ...base, published: true, gradeUnsubmittedCode: true, questions: [{ ...base.questions[0],
      textResponse: encodeCodeDraft(CodeLanguage.JAVA, 'class Main {}'),
      code: { code: 'class Main {}', language: CodeLanguage.JAVA, fromDraft: true, submittedAt: null } }] });
    expect(await screen.findByText(/Your saved draft was graded · Java/)).toBeTruthy();
    expect((await screen.findByLabelText('Code editor', {}, { timeout: 5000 }) as HTMLTextAreaElement).value).toBe('class Main {}');
  });
});
