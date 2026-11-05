import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import type { PaletteSummary } from '../ui.types';
interface Props {
  isOpen: boolean; onClose: () => void; onConfirm: () => void; summary: PaletteSummary;
  isSubmitting?: boolean; isSubmitPending?: boolean; error?: string | null;
  onSelectQuestion?: (index: number) => void; gradeUnsubmittedCode?: boolean;
}
export function SubmitConfirmationModal({ isOpen, onClose, onConfirm, summary, isSubmitting, isSubmitPending, error, onSelectQuestion, gradeUnsubmittedCode }: Props) {
  const busy = isSubmitting || isSubmitPending;
  return <Dialog open={isOpen} onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent>
      <DialogTitle>Finish exam</DialogTitle>
      <DialogDescription>Review your progress. You cannot change your answers after finishing.</DialogDescription>
      {isSubmitPending && <Alert variant="warning">Submission pending. Reconnect to finish and keep this app open.</Alert>}
      {error && <Alert variant="destructive">{error}</Alert>}
      <dl className="grid grid-cols-2 gap-3 rounded border p-4 text-sm">
        <dt>Objective answers</dt><dd>{summary.mcqAnswered ?? summary.answered + summary.answeredAndMarkedReview} of {summary.mcqTotal ?? summary.total}</dd>
        <dt>Coding submitted</dt><dd>{summary.codingSubmitted ?? 0}</dd>
        <dt>Coding not submitted / changed</dt><dd>{summary.codingUnsubmitted?.length ?? 0}</dd>
        <dt>Marked for review</dt><dd>{summary.markedReview + summary.answeredAndMarkedReview}</dd>
      </dl>
      {!!summary.codingUnsubmitted?.length && <Alert variant="warning">
        {gradeUnsubmittedCode ? 'Saved drafts are graded only if you never pressed Submit. A previous Submit takes priority over later edits.' : 'Unsubmitted code earns no marks. If you edited after Submit, the last submitted version counts.'}
        <div className="mt-2 flex flex-wrap gap-2">{summary.codingUnsubmitted.map(index => <Button key={index} size="sm" variant="outline" disabled={busy} onClick={() => onSelectQuestion?.(index)}>Question {index + 1}</Button>)}</div>
      </Alert>}
      <DialogFooter>
        <Button variant="outline" disabled={busy} onClick={onClose}>Return to exam</Button>
        <Button variant="destructive" loading={!!isSubmitting} disabled={busy} onClick={onConfirm}>{isSubmitPending ? 'Waiting for connection…' : 'Confirm & Submit'}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
