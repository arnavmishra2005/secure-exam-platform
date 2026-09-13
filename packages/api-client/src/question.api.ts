/**
 * Owner: Person B
 */
import { apiClient } from './client';
import type {
  AddQuestionToExamRequest,
  BulkImportResult,
  CreateOptionRequest,
  CreateQuestionRequest,
  ExamQuestion,
  Option,
  QuestionWithOptions,
  ReorderExamQuestionsRequest,
  UpdateQuestionRequest,
} from '@secure-exam/types';

export function getQuestions(): Promise<QuestionWithOptions[]> {
  return apiClient.get<QuestionWithOptions[]>('/questions').then((res) => res.data);
}

export function getQuestion(questionId: string): Promise<QuestionWithOptions> {
  return apiClient.get<QuestionWithOptions>(`/questions/${questionId}`).then((res) => res.data);
}

export function createQuestion(data: CreateQuestionRequest): Promise<QuestionWithOptions> {
  return apiClient.post<QuestionWithOptions>('/questions', data).then((res) => res.data);
}

export function updateQuestion(
  questionId: string,
  data: UpdateQuestionRequest,
): Promise<QuestionWithOptions> {
  return apiClient.patch<QuestionWithOptions>(`/questions/${questionId}`, data).then((res) => res.data);
}

export function deleteQuestion(questionId: string): Promise<void> {
  return apiClient.delete<void>(`/questions/${questionId}`).then(() => undefined);
}

export function addOption(questionId: string, data: CreateOptionRequest): Promise<Option> {
  return apiClient.post<Option>(`/questions/${questionId}/options`, data).then((res) => res.data);
}

export function updateOption(
  questionId: string,
  optionId: string,
  data: Partial<CreateOptionRequest>,
): Promise<Option> {
  return apiClient.patch<Option>(`/questions/${questionId}/options/${optionId}`, data).then((res) => res.data);
}

export function deleteOption(questionId: string, optionId: string): Promise<void> {
  return apiClient.delete<void>(`/questions/${questionId}/options/${optionId}`).then(() => undefined);
}

// ---- Exam <-> Question mapping ----

export function getExamQuestions(examId: string): Promise<QuestionWithOptions[]> {
  return apiClient.get<QuestionWithOptions[]>(`/exams/${examId}/questions`).then((res) => res.data);
}

export function addQuestionToExam(
  examId: string,
  data: AddQuestionToExamRequest,
): Promise<ExamQuestion> {
  return apiClient.post<ExamQuestion>(`/exams/${examId}/questions`, data).then((res) => res.data);
}

export function removeQuestionFromExam(examId: string, questionId: string): Promise<void> {
  return apiClient.delete<void>(`/exams/${examId}/questions/${questionId}`).then(() => undefined);
}

export function reorderExamQuestions(
  examId: string,
  data: ReorderExamQuestionsRequest,
): Promise<ExamQuestion[]> {
  return apiClient.patch<ExamQuestion[]>(`/exams/${examId}/questions/reorder`, data).then((res) => res.data);
}

// ---- Bulk import ----

export function importQuestions(file: File): Promise<BulkImportResult> {
  const form = new FormData();
  form.append('file', file);
  return apiClient.post<BulkImportResult>('/questions/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((res) => res.data);
}
