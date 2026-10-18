/**
 * Owner: Person B. Code execution during an attempt (student).
 */
import { apiClient } from './client';
import type {
  CodeRunRequest,
  CodeRunResponse,
  CodeSubmitRequest,
  CodeSubmitResponse,
  CodingClientConfig,
} from '@secure-exam/types';

export function runCode(attemptId: string, data: CodeRunRequest): Promise<CodeRunResponse> {
  return apiClient.post<CodeRunResponse>(`/attempts/${attemptId}/code/run`, data).then((res) => res.data);
}

export function submitCode(attemptId: string, data: CodeSubmitRequest): Promise<CodeSubmitResponse> {
  return apiClient.post<CodeSubmitResponse>(`/attempts/${attemptId}/code/submit`, data).then((res) => res.data);
}

/** Where code may run and how Submit behaves (server settings). */
export function getCodingConfig(): Promise<CodingClientConfig> {
  return apiClient.get<CodingClientConfig>('/coding/config').then((res) => res.data);
}
