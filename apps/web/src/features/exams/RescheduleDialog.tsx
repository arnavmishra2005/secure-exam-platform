// Owner: Person A
// Move a scheduled, active or published exam. The API enforces the rules;
// this dialog explains them and sends only what changed.

import { rescheduleExam } from '@secure-exam/api-client';
import type { Exam, RescheduleExamRequest } from '@secure-exam/types';
import { useEffect, useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/errors';
import { toLocalInputValue } from '@/lib/format';

interface RescheduleDialogProps {
  exam: Exam;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRescheduled: () => void;
}

export function RescheduleDialog({ exam, open, onOpenChange, onRescheduled }: RescheduleDialogProps) {
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStartTime(toLocalInputValue(exam.startTime));
    setEndTime(toLocalInputValue(exam.endTime));
    setDurationMinutes(String(exam.durationMinutes));
    setNote(exam.scheduleNote ?? '');
    setError(null);
  }, [open, exam]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const payload: RescheduleExamRequest = {};
    if (startTime !== toLocalInputValue(exam.startTime)) payload.startTime = new Date(startTime).toISOString();
    if (endTime !== toLocalInputValue(exam.endTime)) payload.endTime = new Date(endTime).toISOString();
    if (Number(durationMinutes) !== exam.durationMinutes) payload.durationMinutes = Number(durationMinutes);
    if (note.trim() !== (exam.scheduleNote ?? '')) payload.note = note.trim();
    if (Object.keys(payload).length === 0) return setError('Nothing has changed.');
    if (!Number.isInteger(Number(durationMinutes)) || Number(durationMinutes) < 1) {
      return setError('Duration must be a whole number of minutes.');
    }

    setSaving(true);
    try {
      await rescheduleExam(exam.id, payload);
      toast.success(exam.publishedAt ? 'Rescheduled. Registered students were notified.' : 'Rescheduled');
      onRescheduled();
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reschedule exam</DialogTitle>
          <DialogDescription>
            Before anyone starts, any time can change. Once a student has started, only the closing time can move, and
            only later; use Extend time to give running attempts more time.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Opens at">
              <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
            </Field>
            <Field label="Closes at">
              <Input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
            </Field>
            <Field label="Duration (minutes)">
              <Input type="number" min={1} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} required />
            </Field>
          </div>
          <Field label="Note for students (optional)" hint='Shown on their dashboard, e.g. "Delayed 30 min: lab network".'>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Reschedule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
