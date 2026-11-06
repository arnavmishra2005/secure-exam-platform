import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SubmitConfirmationModal } from './SubmitConfirmationModal';
const summary = { total: 3, answered: 1, visited: 2, notVisited: 0, markedReview: 0, answeredAndMarkedReview: 0, mcqTotal: 1, mcqAnswered: 1, codingSubmitted: 0, codingUnsubmitted: [1, 2] };
describe('finish confirmation', () => {
  it('warns and links back to unsubmitted questions but still allows finishing', () => {
    const onConfirm = vi.fn(), onSelectQuestion = vi.fn();
    render(<SubmitConfirmationModal isOpen onClose={() => {}} onConfirm={onConfirm} onSelectQuestion={onSelectQuestion} summary={summary} />);
    expect(screen.getByText(/Unsubmitted code earns no marks/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Question 2' }));
    expect(onSelectQuestion).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Submit' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
  it('explains the draft fallback policy when enabled', () => {
    render(<SubmitConfirmationModal isOpen onClose={() => {}} onConfirm={() => {}} summary={summary} gradeUnsubmittedCode />);
    expect(screen.getByText(/Saved drafts are graded only if you never pressed Submit/)).toBeTruthy();
  });
});
