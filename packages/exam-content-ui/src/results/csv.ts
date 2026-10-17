/** Owner: Person B. Client-side CSV export of the matrix. */
import type { QuestionAnalyticsMatrix } from '@secure-exam/types';
import { CELL_STYLE } from './cellStyles';

const esc = (v: string | number | null) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per student; per question: the score (blank if not graded) and the state. */
export function matrixToCsv(m: QuestionAnalyticsMatrix): string {
  const header = [
    'Student',
    'Email',
    'Status',
    'Score',
    'Max',
    ...m.questions.flatMap((q) => [`Q${q.number} score`, `Q${q.number} result`]),
  ];
  const byKey = new Map(m.cells.map((c) => [`${c.attemptId}|${c.questionId}`, c]));
  const rows = m.students.map((s) => [
    s.fullName,
    s.email,
    s.status,
    s.score,
    s.maxScore,
    ...m.questions.flatMap((q) => {
      const c = byKey.get(`${s.attemptId}|${q.id}`);
      return c ? [c.score, CELL_STYLE[c.state].label] : ['', ''];
    }),
  ]);
  return [header, ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n';
}
