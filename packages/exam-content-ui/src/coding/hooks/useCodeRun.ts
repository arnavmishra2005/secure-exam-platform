/**
 * Owner: Person B. Run / Run samples / Submit for one coding question.
 */
import { useMutation } from '@tanstack/react-query';
import {
  CodeLanguage,
  CodeRunKind,
  type CodeRunResponse,
  type CodeSubmitResponse,
} from '@secure-exam/types';
import { errorMessage, errorStatus, useExamContentApi } from '../../api/ExamContentApi';

export type LastAction =
  | { kind: 'run'; result: CodeRunResponse }
  | { kind: 'submit'; result: CodeSubmitResponse }
  | null;

export function friendlyRunError(err: unknown): string {
  const status = errorStatus(err);
  if (status === 429) return errorMessage(err); // "still running" / "too many runs"
  if (status === 503) return 'The code runner is busy or unavailable. Try again in a moment.';
  if (status === 409) return errorMessage(err); // attempt ended, problem not set up
  if (status === undefined) return 'Could not reach the server. Check your connection and try again.';
  return errorMessage(err);
}

export function useCodeRun(attemptId: string, questionId: string, language = CodeLanguage.PYTHON) {
  const api = useExamContentApi();

  const run = useMutation({
    mutationFn: (args: { code: string; kind: CodeRunKind; stdin?: string }) =>
      api.runCode(attemptId, { questionId, language, code: args.code, kind: args.kind, stdin: args.stdin }),
  });
  const submit = useMutation({
    mutationFn: (code: string) => api.submitCode(attemptId, { questionId, language, code }),
  });

  return { run, submit, busy: run.isPending || submit.isPending };
}
