// Owner: Person A
// Pre-flight check + publish. Publishing notifies every registered student.

import { getPublishReadiness, publishExam } from '@secure-exam/api-client';
import type { Exam } from '@secure-exam/types';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';

interface PublishDialogProps {
  exam: Exam;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublished: () => void;
}

export function PublishDialog({ exam, open, onOpenChange, onPublished }: PublishDialogProps) {
  const [passPercentage, setPassPercentage] = useState(String(exam.passPercentage));
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const readiness = useQuery({
    queryKey: ['exams', exam.id, 'publish-readiness'],
    queryFn: () => getPublishReadiness(exam.id),
    enabled: open,
    staleTime: 0,
  });

  useEffect(() => {
    if (open) {
      setPassPercentage(String(exam.passPercentage));
      setMessage('');
      setError(null);
    }
  }, [open, exam.passPercentage]);

  async function handlePublish() {
    setPublishing(true);
    setError(null);
    try {
      const result = await publishExam(exam.id, {
        passPercentage: Number(passPercentage),
        message: message.trim() || undefined,
      });
      toast.success(`Published. ${result.notifiedCount} student(s) notified.`);
      onPublished();
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPublishing(false);
    }
  }

  const r = readiness.data;
  const pass = Number(passPercentage);
  const passValid = Number.isInteger(pass) && pass >= 0 && pass <= 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish “{exam.title}”</DialogTitle>
          <DialogDescription>
            Registered students will see it on their dashboard and get a notification. It opens {formatDateTime(exam.startTime)}.
            {exam.status === 'DRAFT' && ' The draft is scheduled as part of publishing.'}
          </DialogDescription>
        </DialogHeader>

        {readiness.isPending ? (
          <Spinner label="Checking the exam" />
        ) : readiness.error ? (
          <Alert variant="destructive">{getErrorMessage(readiness.error)}</Alert>
        ) : r ? (
          <div className="space-y-4">
            <ul className="grid grid-cols-2 gap-3 text-sm">
              <li className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Registered students</p>
                <p className="font-serif text-xl font-semibold">{r.registeredCount}</p>
              </li>
              <li className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Questions</p>
                <p className="font-serif text-xl font-semibold">{r.questionCount}</p>
              </li>
            </ul>
            {r.canPublish ? (
              <>
                <Alert variant="success">
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Ready to publish.
                  </span>
                </Alert>
                <Field label="Pass mark (%)">
                  <Input type="number" min={0} max={100} value={passPercentage} onChange={(e) => setPassPercentage(e.target.value)} />
                </Field>
                <Field label="Message to students (optional)" hint="Added to the notification.">
                  <Textarea rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Bring your student ID card." />
                </Field>
              </>
            ) : (
              <Alert variant="warning" title="Not ready to publish">
                <ul className="list-disc pl-4">
                  {r.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </Alert>
            )}
          </div>
        ) : null}

        {error && <Alert variant="destructive">{error}</Alert>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handlePublish} loading={publishing} disabled={!r?.canPublish || !passValid}>
            <Send /> Publish and notify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
