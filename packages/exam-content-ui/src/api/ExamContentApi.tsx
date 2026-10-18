/**
 * Owner: Person B.
 *
 * Every server call this package makes goes through this interface, so the
 * components can run against the real API (default), a fake (tests,
 * playground) or anything a host app wants to wrap.
 */
import { createContext, useContext, type ReactNode } from 'react';
import * as client from '@secure-exam/api-client';
import type {
  AttemptDrilldown,
  BankQuestionDetail,
  BankQuestionPage,
  BankQuestionQuery,
  BulkAddToExamResult,
  BulkImportResult,
  CodeRunRequest,
  CodeRunResponse,
  CodeSubmitRequest,
  CodeSubmitResponse,
  CodingClientConfig,
  CreateTopicRequest,
  QuestionAnalyticsMatrix,
  RecalculateRequest,
  RecalculateResponse,
  SaveBankQuestionRequest,
  TagCount,
  Topic,
  UpdateBankQuestionMetaRequest,
  ValidateCodingRequest,
  ValidateCodingResponse,
} from '@secure-exam/types';

export interface ExamContentApi {
  listBankQuestions(query: BankQuestionQuery): Promise<BankQuestionPage>;
  getBankQuestion(id: string): Promise<BankQuestionDetail>;
  createBankQuestion(data: SaveBankQuestionRequest): Promise<BankQuestionDetail>;
  replaceBankQuestion(id: string, data: SaveBankQuestionRequest): Promise<BankQuestionDetail>;
  updateBankQuestionMeta(id: string, data: UpdateBankQuestionMetaRequest): Promise<BankQuestionDetail>;
  duplicateBankQuestion(id: string): Promise<BankQuestionDetail>;
  deleteBankQuestion(id: string): Promise<void>;
  importBankQuestions(file: File): Promise<BulkImportResult>;
  listTopics(courseId?: string): Promise<Topic[]>;
  createTopic(data: CreateTopicRequest): Promise<Topic>;
  listTags(search?: string): Promise<TagCount[]>;
  addBankQuestionsToExam(examId: string, questionIds: string[]): Promise<BulkAddToExamResult>;
  runCode(attemptId: string, data: CodeRunRequest): Promise<CodeRunResponse>;
  submitCode(attemptId: string, data: CodeSubmitRequest): Promise<CodeSubmitResponse>;
  getQuestionAnalytics(examId: string): Promise<QuestionAnalyticsMatrix>;
  getAttemptDrilldown(examId: string, attemptId: string): Promise<AttemptDrilldown>;
  validateCodingProblem(data: ValidateCodingRequest): Promise<ValidateCodingResponse>;
  getCodingConfig(): Promise<CodingClientConfig>;
  recalculateResults(examId: string, data?: RecalculateRequest): Promise<RecalculateResponse>;
}

/** The real API through @secure-exam/api-client (shared axios instance and token). */
export const defaultExamContentApi: ExamContentApi = {
  listBankQuestions: client.listBankQuestions,
  getBankQuestion: client.getBankQuestion,
  createBankQuestion: client.createBankQuestion,
  replaceBankQuestion: client.replaceBankQuestion,
  updateBankQuestionMeta: client.updateBankQuestionMeta,
  duplicateBankQuestion: client.duplicateBankQuestion,
  deleteBankQuestion: client.deleteBankQuestion,
  importBankQuestions: client.importBankQuestions,
  listTopics: client.listTopics,
  createTopic: client.createTopic,
  listTags: client.listTags,
  addBankQuestionsToExam: client.addBankQuestionsToExam,
  runCode: client.runCode,
  submitCode: client.submitCode,
  getQuestionAnalytics: client.getQuestionAnalytics,
  getAttemptDrilldown: client.getAttemptDrilldown,
  validateCodingProblem: client.validateCodingProblem,
  getCodingConfig: client.getCodingConfig,
  recalculateResults: client.recalculateResults,
};

const ApiContext = createContext<ExamContentApi>(defaultExamContentApi);

/** Optional: only needed to swap the API (tests, playground). */
export function ExamContentApiProvider({ api, children }: { api: ExamContentApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useExamContentApi(): ExamContentApi {
  return useContext(ApiContext);
}

/** Server error message for display (axios error body `message`, which may be a list). */
export function errorMessage(err: unknown): string {
  const data = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data;
  const msg = data?.message;
  if (Array.isArray(msg)) return msg.join('; ');
  if (typeof msg === 'string') return msg;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

/** HTTP status of an axios error, if any. */
export function errorStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}
