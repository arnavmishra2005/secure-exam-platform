import type { StudentQuestionReview } from '@secure-exam/types';
import { formatScore } from '@/lib/format';

export function ReviewScore({ analysis }: { analysis: NonNullable<StudentQuestionReview['analysis']> }) {
  const { score, maxScore, gradingPending } = analysis;
  const tone = gradingPending || score === null ? 'border-border text-muted-foreground'
    : score >= maxScore && score > 0 ? 'border-emerald-600 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
    : score <= 0 ? 'border-red-600 bg-red-500/10 text-red-700 dark:text-red-400'
    : 'border-amber-600 bg-amber-500/10 text-amber-800 dark:text-amber-300';
  return <span className={`rounded border px-2 py-1 text-sm font-semibold ${tone}`}>
    {gradingPending ? 'Grading in progress' : `${formatScore(score)} / ${formatScore(maxScore)} marks`}
  </span>;
}
