// Owner: Person A

import { Permission } from '@secure-exam/types';
import type { CreateExamRequest, Exam } from '@secure-exam/types';
import { useState, type FormEvent } from 'react';
import { useAccess } from '@/auth/useAccess';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { getErrorMessage } from '@/lib/errors';
import { toLocalInputValue } from '@/lib/format';

interface ExamFormProps {
  /** Editing an existing exam; without it the form creates one and asks for its course. */
  initial?: Exam;
  submitLabel: string;
  /** Timing can only change here while the exam is a draft (afterwards: Reschedule). */
  timingLocked?: boolean;
  /** The user may only look, not change anything. */
  readOnly?: boolean;
  onSubmit: (data: CreateExamRequest) => Promise<void>;
  onCancel?: () => void;
}

export function ExamForm({ initial, submitLabel, timingLocked = false, readOnly = false, onSubmit, onCancel }: ExamFormProps) {
  const courses = useAccess().coursesWith(Permission.EXAM_EDIT);
  const [courseId, setCourseId] = useState('');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [durationMinutes, setDurationMinutes] = useState(String(initial?.durationMinutes ?? 60));
  const [startTime, setStartTime] = useState(toLocalInputValue(initial?.startTime));
  const [endTime, setEndTime] = useState(toLocalInputValue(initial?.endTime));
  const [passMarkEnabled, setPassMarkEnabled] = useState(initial?.passMarkEnabled ?? true);
  const [passPercentage, setPassPercentage] = useState(String(initial?.passPercentage ?? 40));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const creating = !initial;
  const course = courseId || courses[0]?.courseId || '';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const duration = Number(durationMinutes);
    const pass = Number(passPercentage);
    if (creating && !course) return setError('Choose the course this exam belongs to.');
    if (!title.trim()) return setError('Title is required.');
    if (!Number.isInteger(duration) || duration < 1) return setError('Duration must be a whole number of minutes.');
    if (passMarkEnabled && (!Number.isInteger(pass) || pass < 0 || pass > 100)) {
      return setError('Pass mark must be between 0 and 100.');
    }
    if (!startTime || !endTime) return setError('Start and end time are required.');
    if (new Date(startTime) >= new Date(endTime)) return setError('The window must end after it starts.');

    setSaving(true);
    try {
      await onSubmit({
        ...(creating ? { courseId: course } : {}),
        title: title.trim(),
        description: description.trim() || undefined,
        passMarkEnabled,
        ...(passMarkEnabled ? { passPercentage: pass } : {}),
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

  if (creating && courses.length === 0) {
    return (
      <Alert variant="info">
        An exam belongs to a course. Create a course first, or ask its instructor to let you create exams on it.
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      {error && <Alert variant="destructive">{error}</Alert>}
      {creating && (
        <Field label="Course" hint="Its instructors and TAs manage the exam, and its students are registered for it.">
          <Select value={course} onChange={(e) => setCourseId(e.target.value)} required>
            {courses.map((c) => (
              <option key={c.courseId} value={c.courseId}>
                {c.code} — {c.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <fieldset disabled={readOnly} className="space-y-5">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Data Structures — Midterm" required />
        </Field>
        <Field label="Description (optional)" hint="Shown to students on the instructions screen.">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </Field>
        {timingLocked && (
          <Alert variant="info">
            Timing can't be edited here once an exam leaves draft. Use <strong>Reschedule</strong> to move it, or{' '}
            <strong>Extend time</strong> to give students more time.
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
          <div className="grid gap-1.5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[hsl(var(--primary))]"
                checked={passMarkEnabled}
                onChange={(e) => setPassMarkEnabled(e.target.checked)}
              />
              Use a pass mark
            </label>
            <Input
              type="number"
              min={0}
              max={100}
              value={passPercentage}
              onChange={(e) => setPassPercentage(e.target.value)}
              disabled={!passMarkEnabled}
              aria-label="Pass mark (%)"
              required={passMarkEnabled}
            />
            <p className="text-xs text-muted-foreground">
              {passMarkEnabled ? 'Percentage of the maximum score.' : 'No pass/fail and no pass rate for this exam.'}
            </p>
          </div>
        </div>
      </fieldset>
      {!readOnly && (
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
      )}
    </form>
  );
}
