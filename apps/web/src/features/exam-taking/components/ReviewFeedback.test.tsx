import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionType, type PublicQuestion } from '@secure-exam/types';
import { QuestionRenderer } from './QuestionRenderer';
import { ExtensionNotice } from './ExtensionNotice';

const question = {
  id: 'q', text: 'Pick an answer', marks: 2, type: QuestionType.MCQ_SINGLE,
  options: [{ id: 'wrong', text: 'Wrong option', order: 0 }, { id: 'right', text: 'Right option', order: 1 }],
} as PublicQuestion;
const base = { question, questionNumber: 1, totalQuestions: 2, selectedOptionIds: ['wrong'], textResponse: '', onSelectOption: vi.fn(), onTextResponseChange: vi.fn(), disabled: true, review: true };

describe('review feedback', () => {
  it.each([QuestionType.MCQ_SINGLE, QuestionType.MCQ_MULTI, QuestionType.TRUE_FALSE])('marks answers directly in the options for %s', type => {
    render(<QuestionRenderer {...base} question={{ ...question, type }} analysis={{ score: -0.5, maxScore: 2, gradingPending: false, reason: 'Wrong option chosen', correctOptionIds: ['right'] }} />);
    expect(screen.getByText('Wrong option').closest('label')?.className).toContain('border-red-600');
    expect(screen.getByText('Right option').closest('label')?.className).toContain('border-emerald-600');
    expect(screen.getAllByText('Right option')).toHaveLength(1);
    expect(screen.getByText(/-0.50 \/ 2 marks/)).toBeTruthy();
    expect(screen.getByText('Incorrect · Your answer')).toBeTruthy();
    expect(screen.getByText('Correct answer · Not selected')).toBeTruthy();
  });
  it('shows neutral selected answers before publication, without correctness labels', () => {
    render(<QuestionRenderer {...base} />);
    expect(screen.getByText('Wrong option').closest('label')?.className).toContain('border-slate-500');
    expect(screen.queryByText(/Incorrect/)).toBeNull();
    expect(screen.queryByText(/Correct answer/)).toBeNull();
  });
});

describe('extension notice', () => {
  afterEach(() => vi.useRealTimers());
  it('disappears after 30 seconds and reappears only when the total changes', () => {
    vi.useFakeTimers();
    const { rerender } = render(<ExtensionNotice minutes={10} />);
    expect(screen.getByRole('status').textContent).toContain('+10');
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<ExtensionNotice minutes={10} />);
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<ExtensionNotice minutes={15} />);
    expect(screen.getByRole('status').textContent).toContain('+15');
  });
});
