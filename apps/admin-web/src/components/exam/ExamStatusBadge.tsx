import { ExamStatus } from '@secure-exam/types';

const STYLES: Record<ExamStatus, string> = {
  [ExamStatus.DRAFT]: 'bg-stone-100 text-stone-600 border-stone-300',
  [ExamStatus.SCHEDULED]: 'bg-amber-50 text-amber-700 border-amber-300',
  [ExamStatus.ACTIVE]: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  [ExamStatus.CLOSED]: 'bg-slate-100 text-slate-500 border-slate-300',
};

const LABELS: Record<ExamStatus, string> = {
  [ExamStatus.DRAFT]: 'Draft',
  [ExamStatus.SCHEDULED]: 'Scheduled',
  [ExamStatus.ACTIVE]: 'Active',
  [ExamStatus.CLOSED]: 'Closed',
};

export function ExamStatusBadge({ status }: { status: ExamStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {LABELS[status]}
    </span>
  );
}
