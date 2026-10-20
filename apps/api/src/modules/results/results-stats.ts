// Owner: Person A (Platform, Courses, Publish, Results)
// Pure statistics for the results overview — no I/O, unit tested.

import type { HistogramBucket } from '@secure-exam/types';

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Population standard deviation. */
export function standardDeviation(values: number[]): number | null {
  const m = mean(values);
  if (m === null) return null;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length);
}

/** Ten 10-point buckets over 0-100; the last one includes 100. Out-of-range values are clamped. */
export function percentageHistogram(percentages: number[]): HistogramBucket[] {
  const buckets: HistogramBucket[] = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i * 10 + 10, count: 0 }));
  for (const p of percentages) {
    const clamped = Math.min(Math.max(p, 0), 100);
    buckets[Math.min(Math.floor(clamped / 10), 9)].count++;
  }
  return buckets;
}

export function percentage(score: number, maxScore: number): number {
  return maxScore > 0 ? (score / maxScore) * 100 : 0;
}

/**
 * Standard competition ranking ("1, 2, 2, 4") by score, highest first. Ties
 * share a rank; within a tie, the faster attempt is listed first.
 */
export function rankByScore<T extends { score: number; timeTakenSeconds: number | null }>(
  rows: T[],
): (T & { rank: number })[] {
  const sorted = [...rows].sort(
    (a, b) => b.score - a.score || (a.timeTakenSeconds ?? Infinity) - (b.timeTakenSeconds ?? Infinity),
  );
  let rank = 0;
  return sorted.map((row, index) => {
    if (index === 0 || row.score !== sorted[index - 1].score) rank = index + 1;
    return { ...row, rank };
  });
}
