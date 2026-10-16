/** Owner: Person B. React Query hooks for the bank. Keys live under ['question-bank']. */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BankQuestionQuery,
  SaveBankQuestionRequest,
  UpdateBankQuestionMetaRequest,
} from '@secure-exam/types';
import { useExamContentApi } from '../api/ExamContentApi';

export const bankKeys = {
  all: ['question-bank'] as const,
  list: (q: BankQuestionQuery) => ['question-bank', 'list', q] as const,
  detail: (id: string) => ['question-bank', 'detail', id] as const,
  topics: (courseId?: string) => ['question-bank', 'topics', courseId ?? null] as const,
  tags: (search: string) => ['question-bank', 'tags', search] as const,
};

export function useBankQuestions(query: BankQuestionQuery) {
  const api = useExamContentApi();
  return useQuery({
    queryKey: bankKeys.list(query),
    queryFn: () => api.listBankQuestions(query),
    placeholderData: keepPreviousData,
  });
}

export function useBankQuestion(id: string | undefined) {
  const api = useExamContentApi();
  return useQuery({
    queryKey: bankKeys.detail(id ?? ''),
    queryFn: () => api.getBankQuestion(id!),
    enabled: !!id,
  });
}

export function useTopics(courseId?: string) {
  const api = useExamContentApi();
  return useQuery({ queryKey: bankKeys.topics(courseId), queryFn: () => api.listTopics(courseId) });
}

export function useTags(search: string) {
  const api = useExamContentApi();
  return useQuery({ queryKey: bankKeys.tags(search), queryFn: () => api.listTags(search || undefined) });
}

/** All bank mutations; each refreshes every bank query on success. */
export function useBankMutations() {
  const api = useExamContentApi();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: bankKeys.all });

  return {
    create: useMutation({ mutationFn: (d: SaveBankQuestionRequest) => api.createBankQuestion(d), onSuccess: invalidate }),
    replace: useMutation({
      mutationFn: ({ id, data }: { id: string; data: SaveBankQuestionRequest }) => api.replaceBankQuestion(id, data),
      onSuccess: invalidate,
    }),
    updateMeta: useMutation({
      mutationFn: ({ id, data }: { id: string; data: UpdateBankQuestionMetaRequest }) =>
        api.updateBankQuestionMeta(id, data),
      onSuccess: invalidate,
    }),
    duplicate: useMutation({ mutationFn: (id: string) => api.duplicateBankQuestion(id), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (id: string) => api.deleteBankQuestion(id), onSuccess: invalidate }),
    importCsv: useMutation({ mutationFn: (f: File) => api.importBankQuestions(f), onSuccess: invalidate }),
    createTopic: useMutation({
      mutationFn: ({ name, courseId }: { name: string; courseId?: string | null }) => api.createTopic({ name, courseId }),
      onSuccess: invalidate,
    }),
    addToExam: useMutation({
      mutationFn: ({ examId, ids }: { examId: string; ids: string[] }) => api.addBankQuestionsToExam(examId, ids),
      onSuccess: invalidate,
    }),
  };
}
