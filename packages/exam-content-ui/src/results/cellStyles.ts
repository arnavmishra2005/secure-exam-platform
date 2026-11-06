/** Owner: Person B. How each matrix cell state looks (symbol + color + words, never color alone). */
import { QuestionCellState, type AnalyticsCell } from '@secure-exam/types';

export const CELL_STYLE: Record<QuestionCellState, { symbol: string; label: string; className: string }> = {
  [QuestionCellState.CORRECT]: { symbol: '✓', label: 'Correct', className: 'bg-emerald-100 text-emerald-800' },
  [QuestionCellState.PARTIAL]: { symbol: '◐', label: 'Partly correct', className: 'bg-amber-100 text-amber-800' },
  [QuestionCellState.WRONG]: { symbol: '✗', label: 'Wrong', className: 'bg-red-100 text-red-800' },
  [QuestionCellState.NOT_ANSWERED]: { symbol: '–', label: 'Not answered', className: 'bg-slate-100 text-slate-400' },
  [QuestionCellState.PENDING]: { symbol: '…', label: 'Not graded yet', className: 'bg-sky-100 text-sky-800' },
};

export function cellTitle(cell: AnalyticsCell): string {
  const s = CELL_STYLE[cell.state];
  const score = cell.score === null ? '' : ` · ${cell.score}/${cell.maxScore}`;
  const adjusted = cell.adjustment ? ` · adjusted ${signed(cell.adjustment)} (auto ${cell.autoScore})` : '';
  return `${s.label}${score}${adjusted}${cell.markedForReview ? ' · marked for review' : ''}`;
}

/** "+2", "−1.5". */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

const pct = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n * 100)}%`);
export { pct };
