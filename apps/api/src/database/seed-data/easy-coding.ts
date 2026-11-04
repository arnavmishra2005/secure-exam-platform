/**
 * Dev seed: easy coding questions for the question bank, for testing the code editor,
 * the runner and the grading. They are not linked to any exam; an instructor adds them to
 * an exam from the question bank.
 *
 * Each question has two sample cases (the student sees them) and three hidden ones.
 * easy-coding.spec.ts runs every reference solution against every case, so a wrong
 * expected output fails the build.
 */

import type { SeedTestCase } from './merge-intervals';

export interface EasyCodingQuestion {
  title: string;
  marks: number;
  statement: string;
  starter: string;
  reference: string;
  testCases: SeedTestCase[];
}

/** Tags on every question below, so they are easy to find in the bank. */
export const EASY_CODING_TAGS = ['sample', 'easy'];
export const EASY_CODING_TOPIC = 'Python basics';

const MARKS = 5;

const sample = (name: string, input: string, expectedOutput: string): SeedTestCase => ({
  name: `sample: ${name}`,
  isSample: true,
  weight: 1,
  input,
  expectedOutput,
});
const hidden = (name: string, input: string, expectedOutput: string): SeedTestCase => ({
  name: `hidden: ${name}`,
  isSample: false,
  weight: 1,
  input,
  expectedOutput,
});

const fizzbuzz = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const k = i + 1;
    return k % 15 === 0 ? 'FizzBuzz' : k % 3 === 0 ? 'Fizz' : k % 5 === 0 ? 'Buzz' : String(k);
  }).join('\n') + '\n';

export const EASY_CODING_QUESTIONS: EasyCodingQuestion[] = [
  {
    title: 'Sum of Two Numbers',
    marks: MARKS,
    statement: `# Sum of Two Numbers

Read two integers and print their sum.

## Input

One line with two integers \`a b\` (\`-10^9 ≤ a, b ≤ 10^9\`).

## Output

Print \`a + b\`.

## Example

Input:

\`\`\`
2 3
\`\`\`

Output:

\`\`\`
5
\`\`\`
`,
    starter: `def add(a, b):
    # Return the sum of a and b.
    pass


a, b = map(int, input().split())
print(add(a, b))
`,
    reference: `def add(a, b):
    return a + b


a, b = map(int, input().split())
print(add(a, b))
`,
    testCases: [
      sample('the statement example', '2 3\n', '5\n'),
      sample('a negative number', '-4 10\n', '6\n'),
      hidden('zeros', '0 0\n', '0\n'),
      hidden('both negative and large', '-1000000000 -1000000000\n', '-2000000000\n'),
      hidden('large positives', '123456789 987654321\n', '1111111110\n'),
    ],
  },
  {
    title: 'Even or Odd',
    marks: MARKS,
    statement: `# Even or Odd

Read an integer and say whether it is even or odd.

## Input

One integer \`n\` (\`-10^9 ≤ n ≤ 10^9\`).

## Output

Print \`Even\` if \`n\` is even, otherwise \`Odd\`.

## Example

Input:

\`\`\`
4
\`\`\`

Output:

\`\`\`
Even
\`\`\`
`,
    starter: `def parity(n):
    # Return "Even" or "Odd".
    pass


n = int(input())
print(parity(n))
`,
    reference: `def parity(n):
    return "Even" if n % 2 == 0 else "Odd"


n = int(input())
print(parity(n))
`,
    testCases: [
      sample('an even number', '4\n', 'Even\n'),
      sample('an odd number', '7\n', 'Odd\n'),
      hidden('zero is even', '0\n', 'Even\n'),
      hidden('a negative odd number', '-3\n', 'Odd\n'),
      hidden('a large even number', '1000000000\n', 'Even\n'),
    ],
  },
  {
    title: 'Reverse a String',
    marks: MARKS,
    statement: `# Reverse a String

Read a line of text and print it reversed.

## Input

One line of text, 1 to 1000 characters. It may contain spaces.

## Output

Print the characters of the line in reverse order.

## Example

Input:

\`\`\`
hello
\`\`\`

Output:

\`\`\`
olleh
\`\`\`
`,
    starter: `def reverse(text):
    # Return text reversed.
    pass


text = input()
print(reverse(text))
`,
    reference: `def reverse(text):
    return text[::-1]


text = input()
print(reverse(text))
`,
    testCases: [
      sample('a single word', 'hello\n', 'olleh\n'),
      sample('spaces are kept', 'Secure Exam\n', 'maxE eruceS\n'),
      hidden('a single character', 'a\n', 'a\n'),
      hidden('a palindrome', 'racecar\n', 'racecar\n'),
      hidden('digits and letters', '12345 abc\n', 'cba 54321\n'),
    ],
  },
  {
    title: 'Largest Number in a List',
    marks: MARKS,
    statement: `# Largest Number in a List

Read a list of integers and print the largest one.

## Input

- The first line contains \`n\` (\`1 ≤ n ≤ 1000\`).
- The second line contains \`n\` integers separated by spaces (\`-10^6 ≤ value ≤ 10^6\`).

## Output

Print the largest integer in the list.

## Example

Input:

\`\`\`
5
3 9 2 7 4
\`\`\`

Output:

\`\`\`
9
\`\`\`
`,
    starter: `def largest(numbers):
    # Return the largest number in the list.
    pass


n = int(input())
numbers = list(map(int, input().split()))
print(largest(numbers))
`,
    reference: `def largest(numbers):
    best = numbers[0]
    for x in numbers:
        if x > best:
            best = x
    return best


n = int(input())
numbers = list(map(int, input().split()))
print(largest(numbers))
`,
    testCases: [
      sample('the statement example', '5\n3 9 2 7 4\n', '9\n'),
      sample('all negative', '3\n-5 -1 -8\n', '-1\n'),
      hidden('a single number', '1\n42\n', '42\n'),
      hidden('all equal', '4\n6 6 6 6\n', '6\n'),
      hidden('mixed signs', '6\n-100 0 100 99 -1 50\n', '100\n'),
    ],
  },
  {
    title: 'Count the Vowels',
    marks: MARKS,
    statement: `# Count the Vowels

Read a line of text and count its vowels: \`a e i o u\`, in upper or lower case.

## Input

One line of text, 1 to 1000 characters.

## Output

Print the number of vowels.

## Example

Input:

\`\`\`
hello world
\`\`\`

Output:

\`\`\`
3
\`\`\`
`,
    starter: `def count_vowels(text):
    # Return how many characters of text are vowels (a, e, i, o, u in any case).
    pass


text = input()
print(count_vowels(text))
`,
    reference: `def count_vowels(text):
    return sum(1 for c in text.lower() if c in "aeiou")


text = input()
print(count_vowels(text))
`,
    testCases: [
      sample('the statement example', 'hello world\n', '3\n'),
      sample('upper and lower case', 'AEIOU aeiou\n', '10\n'),
      hidden('no vowels', 'rhythm\n', '0\n'),
      hidden('mixed case words', 'Programming In Python\n', '5\n'),
      hidden('a single consonant', 'x\n', '0\n'),
    ],
  },
  {
    title: 'FizzBuzz',
    marks: MARKS,
    statement: `# FizzBuzz

Print the numbers from 1 to \`n\`, one per line, with these replacements:

- multiples of both 3 and 5 print \`FizzBuzz\`
- other multiples of 3 print \`Fizz\`
- other multiples of 5 print \`Buzz\`

## Input

One integer \`n\` (\`1 ≤ n ≤ 100\`).

## Output

\`n\` lines, as described above.

## Example

Input:

\`\`\`
5
\`\`\`

Output:

\`\`\`
1
2
Fizz
4
Buzz
\`\`\`
`,
    starter: `def fizzbuzz(n):
    # Return a list of n strings: "1", "2", "Fizz", ...
    pass


n = int(input())
for line in fizzbuzz(n):
    print(line)
`,
    reference: `def fizzbuzz(n):
    result = []
    for k in range(1, n + 1):
        if k % 15 == 0:
            result.append("FizzBuzz")
        elif k % 3 == 0:
            result.append("Fizz")
        elif k % 5 == 0:
            result.append("Buzz")
        else:
            result.append(str(k))
    return result


n = int(input())
for line in fizzbuzz(n):
    print(line)
`,
    testCases: [
      sample('the statement example', '5\n', fizzbuzz(5)),
      sample('up to the first FizzBuzz', '15\n', fizzbuzz(15)),
      hidden('n = 1', '1\n', fizzbuzz(1)),
      hidden('n = 3', '3\n', fizzbuzz(3)),
      hidden('n = 30', '30\n', fizzbuzz(30)),
    ],
  },
];
