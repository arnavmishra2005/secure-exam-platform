/** Owner: Person B. Display text and colors for run/test outcomes. */
import { CodeErrorKind, ExecutionStatus, TestCaseVerdict, type CodeErrorInfo } from '@secure-exam/types';

type Tone = 'green' | 'red' | 'amber' | 'violet' | 'neutral';

export const VERDICT_LABEL: Record<TestCaseVerdict, { text: string; tone: Tone }> = {
  [TestCaseVerdict.PASSED]: { text: 'Passed', tone: 'green' },
  [TestCaseVerdict.WRONG_ANSWER]: { text: 'Wrong answer', tone: 'red' },
  [TestCaseVerdict.COMPILATION_ERROR]: { text: 'Compilation error', tone: 'amber' },
  [TestCaseVerdict.RUNTIME_ERROR]: { text: 'Runtime error', tone: 'amber' },
  [TestCaseVerdict.TIME_LIMIT_EXCEEDED]: { text: 'Time limit exceeded', tone: 'violet' },
  [TestCaseVerdict.MEMORY_LIMIT_EXCEEDED]: { text: 'Memory limit exceeded', tone: 'violet' },
  [TestCaseVerdict.OUTPUT_LIMIT_EXCEEDED]: { text: 'Output limit exceeded', tone: 'violet' },
  [TestCaseVerdict.INTERNAL_ERROR]: { text: 'Runner error', tone: 'neutral' },
};

export const STATUS_LABEL: Record<ExecutionStatus, { text: string; tone: Tone }> = {
  [ExecutionStatus.OK]: { text: 'Finished', tone: 'green' },
  [ExecutionStatus.COMPILATION_ERROR]: { text: 'Compilation error', tone: 'amber' },
  [ExecutionStatus.RUNTIME_ERROR]: { text: 'Runtime error', tone: 'amber' },
  [ExecutionStatus.TIME_LIMIT_EXCEEDED]: { text: 'Time limit exceeded', tone: 'violet' },
  [ExecutionStatus.MEMORY_LIMIT_EXCEEDED]: { text: 'Memory limit exceeded', tone: 'violet' },
  [ExecutionStatus.OUTPUT_LIMIT_EXCEEDED]: { text: 'Output limit exceeded', tone: 'violet' },
  [ExecutionStatus.INTERNAL_ERROR]: { text: 'Runner error', tone: 'neutral' },
};

/** Title and one-line hint for each kind of error. */
export const ERROR_KIND_LABEL: Record<CodeErrorKind, { title: string; hint: string }> = {
  [CodeErrorKind.SYNTAX]: {
    title: 'Syntax error',
    hint: "Your code couldn't be read. Look for a missing bracket, colon or quote on or just before this line.",
  },
  [CodeErrorKind.INDENTATION]: {
    title: 'Indentation error',
    hint: 'Lines in the same block must start with the same number of spaces. Don\'t mix tabs and spaces.',
  },
  [CodeErrorKind.NAME]: {
    title: 'Name error',
    hint: 'A variable or function is used before it is defined, or its name is misspelt.',
  },
  [CodeErrorKind.TYPE]: {
    title: 'Type error',
    hint: 'A value has the wrong type for this operation, e.g. adding text to a number (in Python, input is text until you convert it with int()), or a failed cast in Java.',
  },
  [CodeErrorKind.VALUE]: {
    title: 'Value error',
    hint: "A value has the right type but the wrong content, e.g. int('abc'). Check how you read and split the input.",
  },
  [CodeErrorKind.INDEX]: {
    title: 'Index error',
    hint: 'An index is out of range (a list, array, string or vector). Check your loop bounds and empty collections.',
  },
  [CodeErrorKind.KEY]: {
    title: 'Key error',
    hint: "A dictionary key doesn't exist. Check with 'in' first, or use .get().",
  },
  [CodeErrorKind.ATTRIBUTE]: {
    title: 'Attribute error',
    hint: "This value doesn't have that method or attribute. Check the spelling and the value's type.",
  },
  [CodeErrorKind.ZERO_DIVISION]: {
    title: 'Division by zero',
    hint: 'Something was divided by zero, or taken modulo zero.',
  },
  [CodeErrorKind.EOF]: {
    title: 'Input ended early',
    hint: 'Your program tried to read more input than it was given. Check how many lines you read.',
  },
  [CodeErrorKind.IMPORT]: {
    title: 'Import error',
    hint: "That module isn't available here. Only the standard library can be used.",
  },
  [CodeErrorKind.STACK_OVERFLOW]: {
    title: 'Recursion too deep',
    hint: 'Your recursion never stops or goes too deep. Check the base case.',
  },
  [CodeErrorKind.SEGFAULT]: {
    title: 'Segmentation fault: invalid memory access',
    hint: 'The program read or wrote memory it doesn\'t own: an array index out of bounds, a null or uninitialised pointer, or very deep recursion.',
  },
  [CodeErrorKind.ABORT]: {
    title: 'Program aborted',
    hint: 'The program stopped itself, e.g. through a failed assertion or abort().',
  },
  [CodeErrorKind.BLOCKED_SYSCALL]: {
    title: 'Blocked by the sandbox',
    hint: 'The program tried something exam code may not do (for example debugging other processes or changing the system). Remove that part of the code.',
  },
  [CodeErrorKind.COMPILE]: {
    title: 'Compilation error',
    hint: "The compiler couldn't build your program. Fix the first error shown; later ones often follow from it.",
  },
  [CodeErrorKind.NULL_POINTER]: {
    title: 'Null pointer',
    hint: 'A variable that holds no object (null) was used. Check that every object is created before it is used.',
  },
  [CodeErrorKind.OTHER]: {
    title: 'Runtime error',
    hint: 'Your program stopped with an error. The details are below.',
  },
};

/** "Indentation error on line 7". */
export function errorTitle(error: CodeErrorInfo): string {
  const { title } = ERROR_KIND_LABEL[error.kind];
  return error.line !== null ? `${title} on line ${error.line}` : title;
}
