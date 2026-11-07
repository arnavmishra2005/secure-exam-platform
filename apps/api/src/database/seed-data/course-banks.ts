/**
 * Dev seed: two courses per instructor, each with its own question bank.
 *
 * Every course gets two topics (scoped to the course) with objective questions,
 * and the algorithms courses also get a coding question. All questions belong
 * to the course's instructor (questions.owner_id), so only that instructor and
 * their TAs see them. course-banks.spec.ts checks the data: correct options,
 * unique texts, and that every coding reference solution passes its tests.
 */

import type { SeedTestCase } from './merge-intervals';

export interface SeedOption {
  text: string;
  correct: boolean;
}

export interface SeedObjectiveQuestion {
  type: 'MCQ_SINGLE' | 'MCQ_MULTI' | 'TRUE_FALSE';
  text: string;
  marks: number;
  negativeMarks: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  explanation: string;
  options: SeedOption[];
}

export interface SeedBankCodingQuestion {
  title: string;
  marks: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  statement: string;
  starter: string;
  reference: string;
  testCases: SeedTestCase[];
}

export interface SeedCourseBank {
  instructorEmail: string;
  course: { code: string; name: string };
  topics: { name: string; questions: SeedObjectiveQuestion[]; coding?: SeedBankCodingQuestion[] }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** One correct answer: the first option listed is the correct one (shown in this order). */
const single = (
  text: string,
  correct: string,
  wrong: string[],
  explanation: string,
  difficulty: SeedObjectiveQuestion['difficulty'] = 'MEDIUM',
): SeedObjectiveQuestion => ({
  type: 'MCQ_SINGLE',
  text,
  marks: 2,
  negativeMarks: 0.5,
  difficulty,
  explanation,
  options: [{ text: correct, correct: true }, ...wrong.map((w) => ({ text: w, correct: false }))],
});

/** Several correct answers: options are given as [text, correct] in display order. */
const multi = (
  text: string,
  options: [string, boolean][],
  explanation: string,
  difficulty: SeedObjectiveQuestion['difficulty'] = 'MEDIUM',
): SeedObjectiveQuestion => ({
  type: 'MCQ_MULTI',
  text,
  marks: 3,
  negativeMarks: 0,
  difficulty,
  explanation,
  options: options.map(([t, c]) => ({ text: t, correct: c })),
});

const trueFalse = (
  text: string,
  answer: boolean,
  explanation: string,
  difficulty: SeedObjectiveQuestion['difficulty'] = 'EASY',
): SeedObjectiveQuestion => ({
  type: 'TRUE_FALSE',
  text,
  marks: 1,
  negativeMarks: 0.25,
  difficulty,
  explanation,
  options: [
    { text: 'True', correct: answer },
    { text: 'False', correct: !answer },
  ],
});

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

// ── Coding questions ───────────────────────────────────────────────────────

const LONGEST_INCREASING_SUBSEQUENCE: SeedBankCodingQuestion = {
  title: 'Longest Increasing Subsequence',
  marks: 10,
  difficulty: 'MEDIUM',
  statement: `# Longest Increasing Subsequence

Given a sequence of integers, print the length of its longest **strictly increasing**
subsequence. A subsequence keeps the original order but may skip elements.

## Input

- Line 1: an integer \`n\` (\`1 ≤ n ≤ 10^5\`).
- Line 2: \`n\` integers \`a_1 … a_n\` (\`-10^9 ≤ a_i ≤ 10^9\`), separated by spaces.

## Output

One integer: the length of the longest strictly increasing subsequence.

## Example

Input:

\`\`\`
8
10 9 2 5 3 7 101 18
\`\`\`

Output:

\`\`\`
4
\`\`\`

One longest subsequence is \`2 3 7 101\`.

An \`O(n²)\` solution is too slow for the largest tests; aim for \`O(n log n)\`.
`,
  starter: `import sys


def lis_length(a):
    # Return the length of the longest strictly increasing subsequence of a.
    return 0


def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    a = list(map(int, data[1:1 + n]))
    print(lis_length(a))


main()
`,
  reference: `import sys
from bisect import bisect_left


def lis_length(a):
    tails = []
    for x in a:
        i = bisect_left(tails, x)
        if i == len(tails):
            tails.append(x)
        else:
            tails[i] = x
    return len(tails)


def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    a = list(map(int, data[1:1 + n]))
    print(lis_length(a))


main()
`,
  testCases: [
    sample('example', '8\n10 9 2 5 3 7 101 18\n', '4\n'),
    sample('decreasing', '5\n5 4 3 2 1\n', '1\n'),
    hidden('single element', '1\n42\n', '1\n'),
    hidden('duplicates are not increasing', '6\n1 2 2 3 3 4\n', '4\n'),
    hidden('digits of pi', '10\n3 1 4 1 5 9 2 6 5 3\n', '4\n'),
    hidden('negative numbers', '7\n-5 -1 -3 0 -2 4 2\n', '4\n'),
    hidden('all equal', '4\n7 7 7 7\n', '1\n'),
    hidden(
      'large sorted input',
      `100000\n${Array.from({ length: 100000 }, (_, i) => i).join(' ')}\n`,
      '100000\n',
    ),
  ],
};

const BALANCED_BRACKETS: SeedBankCodingQuestion = {
  title: 'Balanced Brackets',
  marks: 5,
  difficulty: 'EASY',
  statement: `# Balanced Brackets

A string of brackets is **balanced** if every opening bracket \`( [ {\` is closed by the
matching bracket of the same type, and brackets close in the reverse order they were opened.

Print \`YES\` if the string is balanced and \`NO\` otherwise.

## Input

One line containing only the characters \`()[]{}\` (length \`0 ≤ |s| ≤ 10^5\`).

## Output

\`YES\` or \`NO\`.

## Example

Input:

\`\`\`
{[()()]}
\`\`\`

Output:

\`\`\`
YES
\`\`\`

\`([)]\` is not balanced: \`[\` is closed by \`)\`.
`,
  starter: `import sys


def is_balanced(s):
    # Return True if every bracket in s is closed in the right order.
    return False


s = sys.stdin.read().strip()
print('YES' if is_balanced(s) else 'NO')
`,
  reference: `import sys


def is_balanced(s):
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for ch in s:
        if ch in '([{':
            stack.append(ch)
        elif not stack or stack.pop() != pairs[ch]:
            return False
    return not stack


s = sys.stdin.read().strip()
print('YES' if is_balanced(s) else 'NO')
`,
  testCases: [
    sample('nested', '{[()()]}\n', 'YES\n'),
    sample('crossed', '([)]\n', 'NO\n'),
    hidden('empty string', '\n', 'YES\n'),
    hidden('only opening', '(((\n', 'NO\n'),
    hidden('closing first', ')(\n', 'NO\n'),
    hidden('sequence of pairs', '()[]{}\n', 'YES\n'),
    hidden('one extra closing', '{[]}}\n', 'NO\n'),
    hidden('deep nesting', `${'('.repeat(50000)}${')'.repeat(50000)}\n`, 'YES\n'),
  ],
};

// ── Courses ────────────────────────────────────────────────────────────────

export const COURSE_BANKS: SeedCourseBank[] = [
  // Dr. Meera Iyer
  {
    instructorEmail: 'instructor@secure-exam.dev',
    course: { code: 'CS201', name: 'Operating Systems & Networks' },
    topics: [
      {
        name: 'Process scheduling & synchronisation',
        questions: [
          single(
            'In Round Robin scheduling, what happens as the time quantum is made very large?',
            'It behaves like First-Come-First-Served (FCFS)',
            ['It behaves like Shortest Job First (SJF)', 'The number of context switches increases', 'Short processes start to starve'],
            'With a quantum longer than every CPU burst, each process runs to completion in arrival order, which is FCFS.',
          ),
          multi(
            'Which of the following are necessary conditions for a deadlock (the Coffman conditions)?',
            [
              ['Mutual exclusion', true],
              ['Hold and wait', true],
              ['No preemption', true],
              ['Circular wait', true],
              ['Starvation', false],
            ],
            'All four Coffman conditions must hold at once for a deadlock. Starvation is a separate problem.',
          ),
          trueFalse(
            'A binary semaphore initialised to 1 can be used to enforce mutual exclusion on a critical section.',
            true,
            'wait() before and signal() after the critical section lets only one process in at a time.',
          ),
          single(
            "Which page replacement algorithm can suffer from Belady's anomaly?",
            'FIFO',
            ['LRU', 'Optimal (OPT)', 'None of these'],
            "FIFO is not a stack algorithm, so adding frames can increase page faults. LRU and OPT are stack algorithms and can't.",
          ),
        ],
      },
      {
        name: 'Computer networks',
        questions: [
          single(
            'Which OSI layer is responsible for routing packets between different networks?',
            'Network layer',
            ['Data link layer', 'Transport layer', 'Session layer'],
            'The network layer (IP) chooses paths across networks; the data link layer only moves frames on one link.',
            'EASY',
          ),
          multi(
            'Which of these protocols use UDP by default?',
            [
              ['DNS (standard queries)', true],
              ['DHCP', true],
              ['HTTP/1.1', false],
              ['TFTP', true],
              ['SMTP', false],
            ],
            'DNS queries, DHCP and TFTP use UDP. HTTP/1.1 and SMTP need TCP’s reliable byte stream.',
          ),
          trueFalse(
            "TCP's connection setup (three-way handshake) uses the segments SYN, SYN-ACK and ACK, in that order.",
            true,
            'The client sends SYN, the server answers SYN-ACK, and the client confirms with ACK.',
          ),
        ],
      },
    ],
  },
  {
    instructorEmail: 'instructor@secure-exam.dev',
    course: { code: 'CS204', name: 'Database Management Systems' },
    topics: [
      {
        name: 'Relational model & SQL',
        questions: [
          single(
            'Which SQL clause filters the groups produced by GROUP BY?',
            'HAVING',
            ['WHERE', 'ORDER BY', 'DISTINCT'],
            'WHERE filters rows before grouping; HAVING filters the groups afterwards and may use aggregates.',
            'EASY',
          ),
          multi(
            'Which joins return every row of the LEFT table, even when it has no matching row in the right table?',
            [
              ['LEFT OUTER JOIN', true],
              ['FULL OUTER JOIN', true],
              ['INNER JOIN', false],
              ['RIGHT OUTER JOIN', false],
            ],
            'LEFT and FULL outer joins keep unmatched left rows (with NULLs on the right). INNER drops them; RIGHT keeps unmatched right rows.',
          ),
          trueFalse(
            'A foreign key column may contain NULL values unless it is also declared NOT NULL.',
            true,
            'A NULL foreign key means "no related row"; the constraint is only checked for non-NULL values.',
          ),
        ],
      },
      {
        name: 'Transactions & normalisation',
        questions: [
          single(
            'Enrolment(StudentId, CourseId, StudentName) has key (StudentId, CourseId), and StudentName depends only on StudentId. What is the highest normal form it satisfies?',
            '1NF',
            ['2NF', '3NF', 'BCNF'],
            'StudentName depends on part of the key (a partial dependency), which violates 2NF.',
            'HARD',
          ),
          single(
            'Which anomaly can still occur at the READ COMMITTED isolation level?',
            'Non-repeatable reads',
            ['Dirty reads', 'Dirty writes', 'None: READ COMMITTED is serializable'],
            'READ COMMITTED only hides uncommitted data. Re-reading a row can return a value another transaction committed in between.',
          ),
          trueFalse(
            'Every relation in BCNF is also in 3NF.',
            true,
            'BCNF is stricter than 3NF: it requires every determinant to be a superkey.',
          ),
        ],
      },
    ],
  },

  // Dr. Arjun Rao
  {
    instructorEmail: 'instructor2@secure-exam.dev',
    course: { code: 'CS301', name: 'Design & Analysis of Algorithms' },
    topics: [
      {
        name: 'Asymptotic analysis & divide and conquer',
        questions: [
          single(
            'What is the solution of the recurrence T(n) = 2T(n/2) + n?',
            'Θ(n log n)',
            ['Θ(n)', 'Θ(n²)', 'Θ(log n)'],
            'Master theorem case 2: a = 2, b = 2, f(n) = n = n^(log_b a), so T(n) = Θ(n log n).',
          ),
          single(
            'What is the running time of quicksort on an already sorted array when the first element is always the pivot?',
            'Θ(n²)',
            ['Θ(n log n)', 'Θ(n)', 'Θ(log n)'],
            'Each partition splits off only the pivot, giving n + (n−1) + … + 1 comparisons.',
          ),
          trueFalse(
            'Every problem in P is also in NP.',
            true,
            'If a problem can be solved in polynomial time, a solution can certainly be verified in polynomial time.',
          ),
        ],
        coding: [LONGEST_INCREASING_SUBSEQUENCE],
      },
      {
        name: 'Greedy & dynamic programming',
        questions: [
          multi(
            'Which of these problems does a greedy algorithm solve optimally?',
            [
              ['Activity selection', true],
              ['Fractional knapsack', true],
              ['Huffman coding', true],
              ['0/1 knapsack', false],
              ['Longest common subsequence', false],
            ],
            '0/1 knapsack and LCS need dynamic programming; the other three have the greedy-choice property.',
          ),
          single(
            'What is the time complexity of the standard dynamic programming algorithm for the longest common subsequence of strings of lengths m and n?',
            'O(mn)',
            ['O(m + n)', 'O(2^(m+n))', 'O(m log n)'],
            'It fills an (m+1) × (n+1) table, each cell in constant time.',
            'EASY',
          ),
          trueFalse(
            "Dijkstra's algorithm always finds correct shortest paths in graphs that have negative edge weights.",
            false,
            "Dijkstra finalises a vertex when it is taken from the queue, which a later negative edge can invalidate. Use Bellman–Ford instead.",
          ),
        ],
      },
    ],
  },
  {
    instructorEmail: 'instructor2@secure-exam.dev',
    course: { code: 'CS210', name: 'Data Structures' },
    topics: [
      {
        name: 'Stacks, queues & lists',
        questions: [
          single(
            'Which data structure is used to evaluate a postfix expression?',
            'Stack',
            ['Queue', 'Binary search tree', 'Hash table'],
            'Operands are pushed; an operator pops its operands and pushes the result.',
            'EASY',
          ),
          single(
            'A circular queue is stored in an array of 8 slots and leaves one slot empty to tell "full" from "empty". How many elements can it hold at most?',
            '7',
            ['8', '6', '9'],
            'With one slot always kept free, the capacity is size − 1 = 7.',
          ),
          multi(
            'Which of these operations take O(1) time (amortised or expected)?',
            [
              ['Appending to a dynamic array (amortised)', true],
              ['Looking up a key in a hash table with a good hash function (expected)', true],
              ['Inserting at the head of a singly linked list', true],
              ['Searching for a value in an unsorted array', false],
              ['Removing the minimum from a binary heap', false],
            ],
            'Searching an unsorted array is O(n) and extract-min on a binary heap is O(log n).',
          ),
        ],
        coding: [BALANCED_BRACKETS],
      },
      {
        name: 'Trees & heaps',
        questions: [
          single(
            'An inorder traversal of a binary search tree visits the keys in which order?',
            'Ascending (sorted) order',
            ['Descending order', 'Level by level', 'The order they were inserted'],
            'Inorder visits the left subtree, the node, then the right subtree, which in a BST is sorted order.',
            'EASY',
          ),
          trueFalse(
            'The height of an AVL tree with n nodes is O(log n).',
            true,
            'The balance condition keeps the tree height at most about 1.44 log₂ n.',
          ),
          trueFalse(
            'In a min-heap with distinct keys, the largest key is always stored in a leaf.',
            true,
            'Every internal node is smaller than its children, so the largest key cannot have a child.',
            'MEDIUM',
          ),
        ],
      },
    ],
  },

  // Prof. Sana Khan
  {
    instructorEmail: 'instructor3@secure-exam.dev',
    course: { code: 'CS320', name: 'Computer Architecture' },
    topics: [
      {
        name: 'Pipelining & hazards',
        questions: [
          single(
            'An ideal 5-stage pipeline with no stalls executes 100 instructions. How many clock cycles does it take?',
            '104',
            ['100', '105', '500'],
            'The first instruction takes 5 cycles; each later one finishes one cycle after the previous: 5 + (100 − 1) = 104.',
          ),
          multi(
            'Which techniques reduce stalls caused by data hazards?',
            [
              ['Operand forwarding (bypassing)', true],
              ['Compiler instruction scheduling (reordering independent instructions)', true],
              ['Branch prediction', false],
              ['A larger cache', false],
            ],
            'Branch prediction targets control hazards, and cache size affects memory stalls, not data dependences.',
          ),
          trueFalse(
            'In the classic 5-stage pipeline, forwarding alone removes every stall caused by a load followed by an instruction that uses the loaded value.',
            false,
            'The loaded value is ready only after MEM, so a load-use pair still needs one stall cycle even with forwarding.',
            'MEDIUM',
          ),
        ],
      },
      {
        name: 'Memory hierarchy',
        questions: [
          single(
            'A cache has a hit time of 1 cycle, a miss rate of 5% and a miss penalty of 100 cycles. What is the average memory access time?',
            '6 cycles',
            ['5 cycles', '1.05 cycles', '100 cycles'],
            'AMAT = hit time + miss rate × miss penalty = 1 + 0.05 × 100 = 6 cycles.',
          ),
          single(
            'Reading the elements of an array one after another mainly benefits from which kind of locality?',
            'Spatial locality',
            ['Temporal locality', 'Branch locality', 'No locality'],
            'Neighbouring elements share a cache block, so one miss brings in the next few elements.',
            'EASY',
          ),
          trueFalse(
            'A fully associative cache has no conflict misses.',
            true,
            'Any block can go in any line, so misses are only compulsory or capacity misses.',
          ),
        ],
      },
    ],
  },
  {
    instructorEmail: 'instructor3@secure-exam.dev',
    course: { code: 'CS340', name: 'Machine Learning' },
    topics: [
      {
        name: 'Supervised learning',
        questions: [
          single(
            'Which of these is a classification algorithm, despite the word "regression" in its name?',
            'Logistic regression',
            ['Linear regression', 'Ridge regression', 'Lasso regression'],
            'Logistic regression models the probability of a class with the sigmoid function.',
            'EASY',
          ),
          multi(
            'Which of the following usually help reduce overfitting?',
            [
              ['L2 regularisation', true],
              ['Collecting more training data', true],
              ['Dropout', true],
              ['Increasing the number of model parameters', false],
              ['Training for many more epochs', false],
            ],
            'More capacity and longer training let the model memorise the training set, which increases overfitting.',
          ),
          trueFalse(
            'k-means clustering is a supervised learning algorithm.',
            false,
            'k-means groups unlabelled data; it never sees target labels, so it is unsupervised.',
          ),
        ],
      },
      {
        name: 'Model evaluation',
        questions: [
          single(
            'A classifier produces 40 true positives, 10 false positives and 20 false negatives. What is its precision?',
            '0.80',
            ['0.67', '0.50', '0.60'],
            'Precision = TP / (TP + FP) = 40 / 50 = 0.80. (Recall would be 40 / 60 ≈ 0.67.)',
          ),
          single(
            'What is the main purpose of k-fold cross-validation?',
            'To estimate how well a model will perform on unseen data',
            ['To make training faster', 'To increase the size of the training set', 'To remove outliers from the data'],
            'Each fold is held out once, so every example is used for validation and the estimate is less noisy.',
            'EASY',
          ),
          trueFalse(
            'A model with high bias usually underfits the training data.',
            true,
            'High bias means the model is too simple to capture the pattern, so it does poorly even on training data.',
          ),
        ],
      },
    ],
  },
];
