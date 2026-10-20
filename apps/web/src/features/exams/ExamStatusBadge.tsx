// Owner: Person A

import { ExamStatus, type Exam } from '@secure-exam/types';
import { Badge, type BadgeProps } from '@/components/ui/badge';

const variants: Record<ExamStatus, { label: string; variant: BadgeProps['variant'] }> = {
  [ExamStatus.DRAFT]: { label: 'Draft', variant: 'secondary' },
  [ExamStatus.SCHEDULED]: { label: 'Scheduled', variant: 'info' },
  [ExamStatus.ACTIVE]: { label: 'Active', variant: 'success' },
  [ExamStatus.CLOSED]: { label: 'Closed', variant: 'outline' },
};

export function ExamStatusBadge({ status }: { status: ExamStatus | string }) {
  const v = variants[status as ExamStatus] ?? { label: status, variant: 'outline' as const };
  return <Badge variant={v.variant}>{v.label}</Badge>;
}

export function PublishedBadge({ exam }: { exam: Pick<Exam, 'publishedAt'> }) {
  return exam.publishedAt ? <Badge variant="success">Published</Badge> : <Badge variant="warning">Not published</Badge>;
}
