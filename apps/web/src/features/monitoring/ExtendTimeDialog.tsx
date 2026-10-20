/**
 * Owner: Person C
 * Extend the whole exam, or one student. Running clients pick up the new
 * expiry on their next heartbeat.
 */

import { extendExamTime } from '@secure-exam/api-client';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

const PRESETS = [5, 10, 15, 30];

export interface ExtendTarget {
  examId: string;
  examTitle: string;
  /** users.id (or students.id) of one student; omit to extend everyone. */
  student?: { id: string; name: string };
}

interface ExtendTimeDialogProps {
  target: ExtendTarget | null;
  onOpenChange: (open: boolean) => void;
  onExtended: () => void;
}

export function ExtendTimeDialog({ target, onOpenChange, onExtended }: ExtendTimeDialogProps) {
  const [minutes, setMinutes] = useState('10');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (target) {
      setMinutes('10');
      setReason('');
      setError(null);
    }
  }, [target]);

  const value = Number(minutes);
  const valid = Number.isInteger(value) && value >= 1 && value <= 480;

  async function handleSubmit() {
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      const extension = await extendExamTime(target.examId, {
        minutes: value,
        studentId: target.student?.id,
        reason: reason.trim() || undefined,
      });
      toast.success(
        target.student
          ? extension.affectedAttempts
            ? `${target.student.name} has ${value} more minute(s).`
            : `${target.student.name} gets ${value} extra minute(s) when they start.`
          : `Exam extended by ${value} minute(s); ${extension.affectedAttempts} running attempt(s) updated.`,
      );
      onExtended();
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{target?.student ? `Extend time for ${target.student.name}` : 'Extend time for everyone'}</DialogTitle>
          <DialogDescription>
            {target?.student
              ? `Only this student's attempt at “${target.examTitle}” is extended. It may run past the exam's closing time.`
              : `“${target?.examTitle}” closes later and every running attempt gets the extra minutes. Students who haven't started get the later closing time.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm font-medium">Extra minutes</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn(String(preset) === minutes && 'border-primary bg-accent')}
                  aria-pressed={String(preset) === minutes}
                  onClick={() => setMinutes(String(preset))}
                >
                  +{preset}
                </Button>
              ))}
              <Input
                type="number"
                min={1}
                max={480}
                className="w-24"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                aria-label="Custom minutes"
              />
            </div>
          </div>
          <Field label="Reason (optional)" hint="Kept in the audit log.">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Power cut in lab 2" />
          </Field>
          {error && <Alert variant="destructive">{error}</Alert>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={saving} disabled={!valid}>
            Add {valid ? value : ''} minute{value === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
