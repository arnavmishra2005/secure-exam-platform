// Owner: Person A

import type { CreateExamRequest, Exam } from '@secure-exam/types';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/errors';
import { toLocalInputValue } from '@/lib/format';

interface ExamFormProps {
  initial?: Exam;
  submitLabel: string;
  /** Timing can only change while the exam is a draft. */
  timingLocked?: boolean;
  onSubmit: (data: CreateExamRequest) => Promise<void>;
  onCancel?: () => void;
}

export function ExamForm({ initial, submitLabel, timingLocked = false, onSubmit, onCancel }: ExamFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [durationMinutes, setDurationMinutes] = useState(String(initial?.durationMinutes ?? 60));
  const [startTime, setStartTime] = useState(toLocalInputValue(initial?.startTime));
  const [endTime, setEndTime] = useState(toLocalInputValue(initial?.endTime));
  const [passPercentage, setPassPercentage] = useState(String(initial?.passPercentage ?? 40));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const duration = Number(durationMinutes);
    const pass = Number(passPercentage);
    if (!title.trim()) return setError('Title is required.');
    if (!Number.isInteger(duration) || duration < 1) return setError('Duration must be a whole number of minutes.');
    if (!Number.isInteger(pass) || pass < 0 || pass > 100) return setError('Pass mark must be between 0 and 100.');
    if (!startTime || !endTime) return setError('Start and end time are required.');
    if (new Date(startTime) >= new Date(endTime)) return setError('The window must end after it starts.');

    setSaving(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        passPercentage: pass,
        ...(timingLocked
          ? {}
          : {
              durationMinutes: duration,
              startTime: new Date(startTime).toISOString(),
              endTime: new Date(endTime).toISOString(),
            }),
      } as CreateExamRequest);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      {error && <Alert variant="destructive">{error}</Alert>}
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Data Structures — Midterm" required />
      </Field>
      <Field label="Description (optional)" hint="Shown to students on the instructions screen.">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </Field>
      {timingLocked && (
        <Alert variant="info">
          Timing is fixed once an exam leaves draft. To give students more time, use <strong>Extend time</strong>.
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Opens at">
          <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={timingLocked} required />
        </Field>
        <Field label="Closes at" hint="No attempt can start after this.">
          <Input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} disabled={timingLocked} required />
        </Field>
        <Field label="Duration (minutes)" hint="Each student's own time limit.">
          <Input type="number" min={1} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} disabled={timingLocked} required />
        </Field>
        <Field label="Pass mark (%)">
          <Input type="number" min={0} max={100} value={passPercentage} onChange={(e) => setPassPercentage(e.target.value)} required />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" loading={saving}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
