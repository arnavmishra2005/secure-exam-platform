/**
 * Dev seed: a medium DSA coding question for the sample exam.
 *
 * "Merge Intervals": sort by start, then sweep, O(n log n). Traps worth a hidden test each:
 * touching intervals merge, input is unsorted, a late interval can bridge earlier ones,
 * nested intervals, duplicates, and the largest values.
 *
 * The expected outputs are computed by `mergeIntervals` below (the same algorithm as the
 * reference solution), and merge-intervals.spec.ts runs the Python reference against every
 * case, so a wrong expected output fails the build.
 */

export const MERGE_INTERVALS_TITLE = 'Merge Intervals';
export const MERGE_INTERVALS_MARKS = 10;

export const MERGE_INTERVALS_STATEMENT = `# Merge Intervals

You are given a list of intervals. Merge every group of overlapping intervals and print the result sorted by start.

Two intervals **overlap when they share at least one point**, so \`[1, 4]\` and \`[4, 5]\` merge into \`[1, 5]\`.

## Input

- The first line contains \`n\`, the number of intervals (\`1 ≤ n ≤ 100000\`).
- Each of the next \`n\` lines contains two integers \`start end\` (\`0 ≤ start ≤ end ≤ 10^9\`).
- The intervals are **not** sorted.

## Output

Print the merged intervals, one per line, as \`start end\`, in increasing order of \`start\`.

## Example

Input:

\`\`\`
4
1 3
8 10
2 6
15 18
\`\`\`

Output:

\`\`\`
1 6
8 10
15 18
\`\`\`

\`[1, 3]\` and \`[2, 6]\` overlap, so they become \`[1, 6]\`. The other two stand alone.

## Notes

- A solution that compares every pair of intervals is too slow for \`n = 100000\`. Think about what sorting buys you.
- Read all the input at once (\`sys.stdin.read()\`) rather than line by line.
`;

export const MERGE_INTERVALS_STARTER = `import sys


def merge_intervals(intervals):
    # intervals: a list of (start, end) pairs, in any order.
    # Return the merged intervals as a list of (start, end) pairs, sorted by start.
    pass


def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    intervals = [(int(data[1 + 2 * i]), int(data[2 + 2 * i])) for i in range(n)]
    for start, end in merge_intervals(intervals):
        print(start, end)


main()
`;

export const MERGE_INTERVALS_REFERENCE = `import sys


def merge_intervals(intervals):
    merged = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged


def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    intervals = [(int(data[1 + 2 * i]), int(data[2 + 2 * i])) for i in range(n)]
    for start, end in merge_intervals(intervals):
        print(start, end)


main()
`;

export type Interval = [number, number];

/** Same algorithm as the reference solution. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Interval[] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

const toInput = (intervals: Interval[]) => `${intervals.length}\n${intervals.map(([s, e]) => `${s} ${e}`).join('\n')}\n`;
const toOutput = (intervals: Interval[]) => `${mergeIntervals(intervals).map(([s, e]) => `${s} ${e}`).join('\n')}\n`;

/** A fixed pseudo-random generator, so the seeded data is the same on every machine. */
function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomIntervals(count: number, span: number, maxLength: number, seed: number): Interval[] {
  const next = lcg(seed);
  return Array.from({ length: count }, () => {
    const start = Math.floor(next() * span);
    return [start, start + Math.floor(next() * maxLength)] as Interval;
  });
}

export interface SeedTestCase {
  name: string;
  isSample: boolean;
  weight: number;
  input: string;
  expectedOutput: string;
}

const make = (name: string, isSample: boolean, weight: number, intervals: Interval[]): SeedTestCase => ({
  name,
  isSample,
  weight,
  input: toInput(intervals),
  expectedOutput: toOutput(intervals),
});

export const MERGE_INTERVALS_TEST_CASES: SeedTestCase[] = [
  // Samples: the student sees these.
  make('sample: the statement example', true, 1, [[1, 3], [8, 10], [2, 6], [15, 18]]),
  make('sample: touching intervals merge', true, 1, [[1, 4], [4, 5]]),
  // Hidden: graded after the exam, the student never sees them.
  make('hidden: a single interval', false, 1, [[5, 5]]),
  make('hidden: nested intervals', false, 2, [[1, 10], [2, 3], [4, 8], [5, 6]]),
  make('hidden: unsorted, nothing overlaps', false, 2, [[20, 25], [1, 2], [10, 12], [5, 6]]),
  make('hidden: a late interval bridges earlier ones', false, 2, [[1, 3], [5, 7], [9, 11], [2, 10]]),
  make('hidden: duplicates and identical starts', false, 2, [[3, 4], [3, 4], [3, 9], [1, 3], [9, 9]]),
  make('hidden: the largest values', false, 2, [[0, 1000000000], [999999999, 1000000000], [0, 0]]),
  make('hidden: 3000 random intervals', false, 3, randomIntervals(3000, 1_000_000, 900, 7)),
  make('hidden: 3000 intervals that mostly chain', false, 3, randomIntervals(3000, 100_000, 120, 21)),
];
