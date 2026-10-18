/**
 * Owner: Person B. Run / Run samples / Submit for one coding question.
 *
 * Where Run executes (decision log in person_b_plan.md):
 *  1. the student's PC, through `localRunner` (Person C's Electron app);
 *  2. the server, only if the server allows it (GET /coding/config →
 *     serverRunEnabled) — when there is no local runner, or as a fallback when
 *     the local runner itself fails (not when the student's program fails).
 * Submit always goes to the server.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CodeLanguage,
  CodeRunKind,
  type CodeRunResponse,
  type CodeSubmitResponse,
  type LocalRunner,
  type PublicCodingProblem,
} from '@secure-exam/types';
import { errorMessage, errorStatus, useExamContentApi } from '../../api/ExamContentApi';
import { verdictFor } from '../compare';
import { LOCAL_OUTPUT_LIMIT_BYTES } from '../localRunner';

export type LastAction =
  | { kind: 'run'; result: CodeRunResponse; where: 'local' | 'server' }
  | { kind: 'submit'; result: CodeSubmitResponse }
  | null;

export function friendlyRunError(err: unknown): string {
  const status = errorStatus(err);
  if (status === 429) return errorMessage(err); // "still running" / "too many runs"
  if (status === 503) return 'The code runner is busy or unavailable. Try again in a moment.';
  if (status === 409 || status === 403) return errorMessage(err);
  if (status === undefined) return errorMessage(err) || 'Could not reach the server. Check your connection and try again.';
  return errorMessage(err);
}

export class RunUnavailableError extends Error {}

export function useCodeRun(
  attemptId: string,
  questionId: string,
  problem: PublicCodingProblem | undefined,
  localRunner?: LocalRunner,
  language = CodeLanguage.PYTHON,
) {
  const api = useExamContentApi();
  const qc = useQueryClient();
  const configQuery = { queryKey: ['coding-config'], queryFn: () => api.getCodingConfig(), staleTime: Infinity };
  const config = useQuery(configQuery);
  const serverRunEnabled = config.data?.serverRunEnabled ?? false;
  const canRun = !!localRunner || serverRunEnabled;

  const runLocally = async (code: string, kind: CodeRunKind, stdin?: string): Promise<CodeRunResponse> => {
    const samples = problem?.samples ?? [];
    const inputs = kind === CodeRunKind.SAMPLES ? samples.map((s) => s.input) : [stdin ?? ''];
    const outcomes = await localRunner!.run({
      language,
      code,
      inputs,
      timeLimitMs: problem?.timeLimitMs ?? 2000,
      memoryLimitMb: problem?.memoryLimitMb ?? 256,
      outputLimitBytes: LOCAL_OUTPUT_LIMIT_BYTES,
    });
    if (kind === CodeRunKind.CUSTOM) return { runId: null, kind, outcome: outcomes[0] };
    return {
      runId: null,
      kind,
      samples: samples.map((s, i) => ({
        index: s.index,
        verdict: verdictFor(outcomes[i], s.expectedOutput, problem!.comparisonMode),
        input: s.input,
        expectedOutput: s.expectedOutput,
        stdout: outcomes[i].stdout,
        stderr: outcomes[i].stderr,
        timeMs: outcomes[i].timeMs,
      })),
    };
  };
  const runOnServer = (code: string, kind: CodeRunKind, stdin?: string) =>
    api.runCode(attemptId, { questionId, language, code, kind, stdin });

  const run = useMutation({
    mutationFn: async (args: { code: string; kind: CodeRunKind; stdin?: string }) => {
      const stdin = args.kind === CodeRunKind.CUSTOM ? args.stdin : undefined;
      // Read the setting at click time: the student may click before it has loaded.
      const serverRunEnabled = await qc
        .ensureQueryData(configQuery)
        .then((c) => c.serverRunEnabled)
        .catch(() => false);
      if (localRunner) {
        try {
          return { result: await runLocally(args.code, args.kind, stdin), where: 'local' as const };
        } catch (err) {
          if (!serverRunEnabled) {
            throw new RunUnavailableError(
              `This computer couldn't run your code (${(err as Error).message}). Your answer is still saved — tell the invigilator.`,
            );
          }
          // Fallback allowed by the server setting.
        }
      } else if (!serverRunEnabled) {
        throw new RunUnavailableError("Running code isn't available on this computer. Your answer is still saved.");
      }
      return { result: await runOnServer(args.code, args.kind, stdin), where: 'server' as const };
    },
  });
  const submit = useMutation({
    mutationFn: (code: string) => api.submitCode(attemptId, { questionId, language, code }),
  });

  return { run, submit, busy: run.isPending || submit.isPending, canRun, configLoading: config.isLoading };
}
