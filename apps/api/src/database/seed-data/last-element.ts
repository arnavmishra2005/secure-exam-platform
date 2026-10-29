/**
 * Dev seed: an easy coding question for the sample exam, for demos.
 *
 * "Last Element of a List": print the last number. Hidden tests cover a single element,
 * negatives, a repeated last value and a long list.
 *
 * The expected outputs are computed from the lists below, and last-element.spec.ts runs the
 * Python reference against every case, so a wrong expected output fails the build.
 */

import type { SeedTestCase } from './merge-intervals';

export const LAST_ELEMENT_TITLE = 'Last Element of a List';
export const LAST_ELEMENT_MARKS = 5;

export const LAST_ELEMENT_STATEMENT = `# Last Element of a List

You are given a list of integers. Print its **last** element.

## Input

- The first line contains \`n\`, the number of elements (\`1 ≤ n ≤ 1000\`).
- The second line contains \`n\` integers separated by spaces (\`-10^9 ≤ value ≤ 10^9\`).

## Output

Print the last element of the list.

## Example

Input:

\`\`\`
5
4 8 15 16 23
\`\`\`

Output:

\`\`\`
23
\`\`\`
`;

export const LAST_ELEMENT_STARTER = `import sys


def last_element(nums):
    # nums: a list of integers with at least one element.
    # Return the last element.
    pass


def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    nums = [int(x) for x in data[1:1 + n]]
    print(last_element(nums))


main()
`;

export const LAST_ELEMENT_REFERENCE = `import sys


def last_element(nums):
    return nums[-1]


def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    nums = [int(x) for x in data[1:1 + n]]
    print(last_element(nums))


main()
`;

const make = (name: string, isSample: boolean, weight: number, nums: number[]): SeedTestCase => ({
  name,
  isSample,
  weight,
  input: `${nums.length}\n${nums.join(' ')}\n`,
  expectedOutput: `${nums[nums.length - 1]}\n`,
});

export const LAST_ELEMENT_TEST_CASES: SeedTestCase[] = [
  // Samples: the student sees these.
  make('sample: the statement example', true, 1, [4, 8, 15, 16, 23]),
  make('sample: a single element', true, 1, [7]),
  // Hidden: graded after the exam, the student never sees them.
  make('hidden: negative numbers', false, 1, [-3, -1, -7, -42]),
  make('hidden: the last value also appears earlier', false, 1, [5, 9, 5, 2, 5]),
  make('hidden: every value the same', false, 1, [0, 0, 0, 0]),
  make('hidden: the largest values', false, 1, [1000000000, -1000000000, 999999999]),
  make('hidden: 1000 elements', false, 2, Array.from({ length: 1000 }, (_, i) => (i * 37) % 1001 - 500)),
];
