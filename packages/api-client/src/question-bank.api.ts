/**
 * Owner: Person B. Admin question bank.
 */
import { apiClient } from './client';
import type {
  BankQuestionDetail,
  BankQuestionPage,
  BankQuestionQuery,
  BulkAddToExamResult,
  BulkImportResult,
  CreateTopicRequest,
  SaveBankQuestionRequest,
  TagCount,
  Topic,
  UpdateBankQuestionMetaRequest,
  ValidateCodingRequest,
  ValidateCodingResponse,
} from '@secure-exam/types';

export function listBankQuestions(query: BankQuestionQuery = {}): Promise<BankQuestionPage> {
  return apiClient.get<BankQuestionPage>('/question-bank/questions', { params: query }).then((res) => res.data);
}

export function getBankQuestion(questionId: string): Promise<BankQuestionDetail> {
  return apiClient.get<BankQuestionDetail>(`/question-bank/questions/${questionId}`).then((res) => res.data);
}

export function createBankQuestion(data: SaveBankQuestionRequest): Promise<BankQuestionDetail> {
  return apiClient.post<BankQuestionDetail>('/question-bank/questions', data).then((res) => res.data);
}

/** Replaces the whole question. Fails with 409 while it is in an ACTIVE/CLOSED exam. */
export function replaceBankQuestion(
  questionId: string,
  data: SaveBankQuestionRequest,
): Promise<BankQuestionDetail> {
  return apiClient
    .put<BankQuestionDetail>(`/question-bank/questions/${questionId}`, data)
    .then((res) => res.data);
}

/** Course / topic / difficulty / status / tags. Works even when the question is locked. */
export function updateBankQuestionMeta(
  questionId: string,
  data: UpdateBankQuestionMetaRequest,
): Promise<BankQuestionDetail> {
  return apiClient
    .patch<BankQuestionDetail>(`/question-bank/questions/${questionId}/meta`, data)
    .then((res) => res.data);
}

export function duplicateBankQuestion(questionId: string): Promise<BankQuestionDetail> {
  return apiClient
    .post<BankQuestionDetail>(`/question-bank/questions/${questionId}/duplicate`)
    .then((res) => res.data);
}

export function deleteBankQuestion(questionId: string): Promise<void> {
  return apiClient.delete<void>(`/question-bank/questions/${questionId}`).then(() => undefined);
}

/** Header-based CSV; see apps/api/src/modules/question-bank/question-bank-import.service.ts. */
export function importBankQuestions(file: File): Promise<BulkImportResult> {
  const form = new FormData();
  form.append('file', file);
  return apiClient
    .post<BulkImportResult>('/question-bank/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((res) => res.data);
}

export function listTopics(courseId?: string): Promise<Topic[]> {
  return apiClient
    .get<Topic[]>('/question-bank/topics', { params: courseId ? { courseId } : {} })
    .then((res) => res.data);
}

export function createTopic(data: CreateTopicRequest): Promise<Topic> {
  return apiClient.post<Topic>('/question-bank/topics', data).then((res) => res.data);
}

export function deleteTopic(topicId: string): Promise<void> {
  return apiClient.delete<void>(`/question-bank/topics/${topicId}`).then(() => undefined);
}

export function listTags(search?: string): Promise<TagCount[]> {
  return apiClient
    .get<TagCount[]>('/question-bank/tags', { params: search ? { search } : {} })
    .then((res) => res.data);
}

/** Adds READY questions to a DRAFT/SCHEDULED exam, in order; skipped ones come back with a reason. */
export function addBankQuestionsToExam(examId: string, questionIds: string[]): Promise<BulkAddToExamResult> {
  return apiClient
    .post<BulkAddToExamResult>(`/exams/${examId}/questions/bulk`, { questionIds })
    .then((res) => res.data);
}

/** Runs the reference solution (or `code`) against the problem's tests; the problem doesn't need to be saved. */
export function validateCodingProblem(data: ValidateCodingRequest): Promise<ValidateCodingResponse> {
  return apiClient.post<ValidateCodingResponse>('/question-bank/validate-coding', data).then((res) => res.data);
}
