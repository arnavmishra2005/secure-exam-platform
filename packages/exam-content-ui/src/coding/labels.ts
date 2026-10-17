/** Owner: Person B. Display text and colors for run/test outcomes. */
import { ExecutionStatus, TestCaseVerdict } from '@secure-exam/types';

type Tone = 'green' | 'red' | 'amber' | 'violet' | 'neutral';

export const VERDICT_LABEL: Record<TestCaseVerdict, { text: string; tone: Tone }> = {
  [TestCaseVerdict.PASSED]: { text: 'Passed', tone: 'green' },
  [TestCaseVerdict.WRONG_ANSWER]: { text: 'Wrong answer', tone: 'red' },
  [TestCaseVerdict.RUNTIME_ERROR]: { text: 'Runtime error', tone: 'amber' },
  [TestCaseVerdict.TIME_LIMIT_EXCEEDED]: { text: 'Time limit exceeded', tone: 'violet' },
  [TestCaseVerdict.MEMORY_LIMIT_EXCEEDED]: { text: 'Memory limit exceeded', tone: 'violet' },
  [TestCaseVerdict.OUTPUT_LIMIT_EXCEEDED]: { text: 'Output limit exceeded', tone: 'violet' },
  [TestCaseVerdict.INTERNAL_ERROR]: { text: 'Runner error', tone: 'neutral' },
};

export const STATUS_LABEL: Record<ExecutionStatus, { text: string; tone: Tone }> = {
  [ExecutionStatus.OK]: { text: 'Finished', tone: 'green' },
  [ExecutionStatus.RUNTIME_ERROR]: { text: 'Runtime error', tone: 'amber' },
  [ExecutionStatus.TIME_LIMIT_EXCEEDED]: { text: 'Time limit exceeded', tone: 'violet' },
  [ExecutionStatus.MEMORY_LIMIT_EXCEEDED]: { text: 'Memory limit exceeded', tone: 'violet' },
  [ExecutionStatus.OUTPUT_LIMIT_EXCEEDED]: { text: 'Output limit exceeded', tone: 'violet' },
  [ExecutionStatus.INTERNAL_ERROR]: { text: 'Runner error', tone: 'neutral' },
};
