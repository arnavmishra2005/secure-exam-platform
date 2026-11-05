import { create } from 'zustand';
import { QuestionState, QuestionType, type LatestCodeSubmission } from '@secure-exam/types';
import type { AnswerDraft, PaletteSummary } from '../ui.types';

type SavedAnswer = { selectedOptionIds: string[] | null; textResponse: string | null; state: QuestionState; markedForReview?: boolean; savedAt?: number };
interface ExamState {
  restoredDraftTimes: Record<string, number>;
  localPending: Record<string, boolean>;
  markLocallySaved: (id: string, draft: AnswerDraft, review: boolean) => void;
  currentIndex: number;
  questionIds: string[];
  questionTypes: Record<string, QuestionType>;
  answers: Record<string, AnswerDraft>;
  questionStates: Record<string, QuestionState>;
  markedForReview: Record<string, boolean>;
  codeSubmittedAt: Record<string, string>;
  codeDirtySinceSubmit: Record<string, boolean>;
  codeSubmissions: Record<string, LatestCodeSubmission>;
  restoreVersion: number;
  initExam: (ids: string[], types?: Record<string, QuestionType>) => void;
  loadSavedAnswers: (answers: Record<string, SavedAnswer>) => void;
  loadCodeSubmissions: (rows: LatestCodeSubmission[]) => void;
  recordCodeSubmission: (row: LatestCodeSubmission) => void;
  setCurrentIndex: (index: number) => void;
  goToNext: () => void;
  goToPrevious: () => void;
  selectOption: (id: string, option: string, multi: boolean) => void;
  setTextResponse: (id: string, text: string) => void;
  clearCurrentAnswer: (id: string) => void;
  toggleMarkForReview: (id: string) => void;
  markAsSaved: (id: string) => void;
  getSummary: () => PaletteSummary;
}
const empty = (): AnswerDraft => ({ selectedOptionIds: [], textResponse: '' });
function derive(state: ExamState) {
  const questionStates = { ...state.questionStates };
  const codeDirtySinceSubmit: Record<string, boolean> = {};
  for (const id of state.questionIds) {
    const draft = state.answers[id] ?? empty();
    const coding = state.questionTypes[id] === QuestionType.CODING;
    const submitted = state.codeSubmissions[id];
    codeDirtySinceSubmit[id] = !!submitted && submitted.code !== draft.textResponse;
    const answered = coding ? !!submitted && !codeDirtySinceSubmit[id] : draft.selectedOptionIds.length > 0 || draft.textResponse.trim().length > 0;
    const visited = questionStates[id] !== QuestionState.NOT_VISITED || draft.textResponse.length > 0;
    questionStates[id] = state.markedForReview[id]
      ? answered ? QuestionState.ANSWERED_AND_MARKED_REVIEW : QuestionState.MARKED_REVIEW
      : answered ? QuestionState.ANSWERED : visited ? QuestionState.VISITED : QuestionState.NOT_VISITED;
  }
  return { questionStates, codeDirtySinceSubmit };
}
export const useExamStore = create<ExamState>((set, get) => ({
  restoredDraftTimes: {},
  localPending: {},
  markLocallySaved: (id, draft, review) => set(state => {
    const current = state.answers[id];
    if (current?.textResponse !== draft.textResponse || JSON.stringify(current?.selectedOptionIds) !== JSON.stringify(draft.selectedOptionIds) || !!state.markedForReview[id] !== review) return {};
    return { localPending: { ...state.localPending, [id]: false } };
  }),
  currentIndex: 0, questionIds: [], questionTypes: {}, answers: {}, questionStates: {}, markedForReview: {},
  codeSubmittedAt: {}, codeDirtySinceSubmit: {}, codeSubmissions: {}, restoreVersion: 0,
  initExam: (ids, types = {}) => set({ restoredDraftTimes: {}, localPending: {}, currentIndex: 0, questionIds: ids, questionTypes: types,
    answers: Object.fromEntries(ids.map(id => [id, empty()])),
    questionStates: Object.fromEntries(ids.map((id,i) => [id, i === 0 ? QuestionState.VISITED : QuestionState.NOT_VISITED])),
    markedForReview: {}, codeSubmittedAt: {}, codeDirtySinceSubmit: {}, codeSubmissions: {},
  }),
  loadSavedAnswers: saved => set(state => {
    const restoredDraftTimes = { ...state.restoredDraftTimes };
    const answers = { ...state.answers }, markedForReview = { ...state.markedForReview }, questionStates = { ...state.questionStates };
    for (const [id, item] of Object.entries(saved)) {
      if (!state.questionIds.includes(id)) continue;
      restoredDraftTimes[id] = item.savedAt ?? Infinity;
      answers[id] = { selectedOptionIds: item.selectedOptionIds ?? [], textResponse: item.textResponse ?? '' };
      markedForReview[id] = item.markedForReview ?? [QuestionState.MARKED_REVIEW, QuestionState.ANSWERED_AND_MARKED_REVIEW].includes(item.state);
      questionStates[id] = item.state;
    }
    const next = { ...state, answers, markedForReview, questionStates };
    return { restoredDraftTimes, answers, markedForReview, ...derive(next), restoreVersion: state.restoreVersion + 1 };
  }),
  loadCodeSubmissions: rows => set(state => {
    const codeSubmissions = Object.fromEntries(rows.map(row => [row.questionId, row]));
    const answers = { ...state.answers };
    for (const row of rows) {
      // Submit can reach the server before the debounced draft save. Restore
      // that confirmed code instead of an older autosave on the next device.
      // Pending local edits have an infinite timestamp and always survive.
      if (state.questionIds.includes(row.questionId) && !state.localPending[row.questionId] &&
          Date.parse(row.savedAt) > (state.restoredDraftTimes[row.questionId] ?? 0)) {
        answers[row.questionId] = { ...(answers[row.questionId] ?? empty()), textResponse: row.code };
      }
    }
    return { answers, codeSubmissions, codeSubmittedAt: Object.fromEntries(rows.map(row => [row.questionId, row.savedAt])), ...derive({ ...state, answers, codeSubmissions }) };
  }),
  recordCodeSubmission: row => set(state => {
    const codeSubmissions = { ...state.codeSubmissions, [row.questionId]: row };
    return { codeSubmissions, codeSubmittedAt: { ...state.codeSubmittedAt, [row.questionId]: row.savedAt }, ...derive({ ...state, codeSubmissions }) };
  }),
  setCurrentIndex: index => set(state => {
    if (index < 0 || index >= state.questionIds.length) return {};
    const id = state.questionIds[index];
    return { currentIndex: index, questionStates: { ...state.questionStates, [id]: state.questionStates[id] === QuestionState.NOT_VISITED ? QuestionState.VISITED : state.questionStates[id] } };
  }),
  goToNext: () => get().setCurrentIndex(get().currentIndex + 1),
  goToPrevious: () => get().setCurrentIndex(get().currentIndex - 1),
  selectOption: (id, option, multi) => set(state => {
    const draft = state.answers[id] ?? empty();
    const selectedOptionIds = multi ? draft.selectedOptionIds.includes(option) ? draft.selectedOptionIds.filter(o => o !== option) : [...draft.selectedOptionIds, option] : [option];
    const answers = { ...state.answers, [id]: { ...draft, selectedOptionIds } };
    return { answers, localPending: { ...state.localPending, [id]: true }, ...derive({ ...state, answers }) };
  }),
  setTextResponse: (id, text) => set(state => {
    if (state.answers[id]?.textResponse === text) return {};
    const answers = { ...state.answers, [id]: { ...(state.answers[id] ?? empty()), textResponse: text } };
    return { answers, localPending: { ...state.localPending, [id]: true }, ...derive({ ...state, answers }) };
  }),
  clearCurrentAnswer: id => set(state => {
    const answers = { ...state.answers, [id]: empty() };
    return { answers, localPending: { ...state.localPending, [id]: true }, ...derive({ ...state, answers }) };
  }),
  toggleMarkForReview: id => set(state => {
    const markedForReview = { ...state.markedForReview, [id]: !state.markedForReview[id] };
    return { markedForReview, localPending: { ...state.localPending, [id]: true }, ...derive({ ...state, markedForReview }) };
  }),
  markAsSaved: () => set(state => derive(state)),
  getSummary: () => {
    const state = get();
    const summary: PaletteSummary = { total: state.questionIds.length, answered: 0, visited: 0, notVisited: 0,
      markedReview: 0, answeredAndMarkedReview: 0, mcqTotal: 0, mcqAnswered: 0, codingSubmitted: 0, codingUnsubmitted: [] };
    state.questionIds.forEach((id, index) => {
      const status = state.questionStates[id];
      const answered = status === QuestionState.ANSWERED || status === QuestionState.ANSWERED_AND_MARKED_REVIEW;
      if (state.questionTypes[id] === QuestionType.CODING) {
        if (answered) summary.codingSubmitted!++; else summary.codingUnsubmitted!.push(index);
      } else { summary.mcqTotal!++; if (answered) summary.mcqAnswered!++; }
      if (status === QuestionState.ANSWERED) summary.answered++;
      else if (status === QuestionState.ANSWERED_AND_MARKED_REVIEW) summary.answeredAndMarkedReview++;
      else if (status === QuestionState.MARKED_REVIEW) summary.markedReview++;
      else if (status === QuestionState.VISITED) summary.visited++;
      else summary.notVisited++;
    });
    return summary;
  },
}));
