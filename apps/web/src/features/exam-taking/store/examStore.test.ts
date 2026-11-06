import { beforeEach, describe, expect, it } from 'vitest';
import { CodeLanguage, CodeSubmissionStatus, QuestionState, QuestionType, encodeCodeDraft } from '@secure-exam/types';
import { useExamStore } from './examStore';
const state = () => useExamStore.getState();
const submitted = { questionId: 'code', submissionId: 'sub', code: 'print(1)', language: CodeLanguage.PYTHON, status: CodeSubmissionStatus.PENDING, savedAt: '2026-11-01T10:00:00Z' };
beforeEach(() => state().initExam(['mcq', 'code'], { mcq: QuestionType.MCQ_SINGLE, code: QuestionType.CODING }));
describe('coding palette and finish summary', () => {
  it('keeps typed/saved code amber until Submit succeeds; edits make it amber again', () => {
    state().setTextResponse('code', submitted.code);
    state().markAsSaved('code');
    expect(state().questionStates.code).toBe(QuestionState.VISITED);
    expect(state().getSummary().codingUnsubmitted).toEqual([1]);
    state().recordCodeSubmission(submitted);
    expect(state().questionStates.code).toBe(QuestionState.ANSWERED);
    state().setTextResponse('code', 'print(2)');
    expect(state().codeDirtySinceSubmit.code).toBe(true);
    expect(state().questionStates.code).toBe(QuestionState.VISITED);
    state().setTextResponse('code', submitted.code);
    expect(state().questionStates.code).toBe(QuestionState.ANSWERED);
  });
  it('restores server submissions and review marks without treating drafts as submitted', () => {
    state().loadSavedAnswers({ code: { selectedOptionIds: [], textResponse: submitted.code, state: QuestionState.ANSWERED, markedForReview: true } });
    expect(state().questionStates.code).toBe(QuestionState.MARKED_REVIEW);
    state().loadCodeSubmissions([submitted]);
    expect(state().questionStates.code).toBe(QuestionState.ANSWERED_AND_MARKED_REVIEW);
    state().selectOption('mcq', 'option', false);
    expect(state().getSummary()).toMatchObject({ mcqAnswered: 1, codingSubmitted: 1, codingUnsubmitted: [] });
  });
  it('does not clear the unsaved indicator when an older save finishes after an edit', () => {
    state().setTextResponse('code', 'old');
    const draft = state().answers.code;
    state().setTextResponse('code', 'new');
    state().markLocallySaved('code', draft, false);
    expect(state().localPending.code).toBe(true);
  });
});

it('recovers a newer explicit Submit when the draft autosave had not reached the server', () => {
  state().loadSavedAnswers({ code: { selectedOptionIds: [], textResponse: 'old draft', state: QuestionState.ANSWERED, savedAt: Date.parse(submitted.savedAt) - 1000 } });
  state().loadCodeSubmissions([submitted]);
  expect(state().answers.code.textResponse).toBe(submitted.code);
  expect(state().questionStates.code).toBe(QuestionState.ANSWERED);
});
it('preserves a newer draft and unsynced local edits when restoring submissions', () => {
  for (const savedAt of [Date.parse(submitted.savedAt) + 1000, Infinity]) {
    state().loadSavedAnswers({ code: { selectedOptionIds: [], textResponse: 'new draft', state: QuestionState.ANSWERED, savedAt } });
    state().loadCodeSubmissions([submitted]);
    expect(state().answers.code.textResponse).toBe('new draft');
    expect(state().codeDirtySinceSubmit.code).toBe(true);
  }
});

describe('coding drafts in other languages (#16)', () => {
  const java = { ...submitted, code: 'class Main {}', language: CodeLanguage.JAVA };
  it('matches a submission against the draft in the same language only', () => {
    state().setTextResponse('code', encodeCodeDraft(CodeLanguage.JAVA, java.code));
    state().recordCodeSubmission(java);
    expect(state().codeDirtySinceSubmit.code).toBe(false);
    expect(state().questionStates.code).toBe(QuestionState.ANSWERED);
    // Same text, but the student switched to C++: that has not been submitted.
    state().setTextResponse('code', encodeCodeDraft(CodeLanguage.CPP, java.code));
    expect(state().codeDirtySinceSubmit.code).toBe(true);
  });
  it('restores a newer submission as a draft in its own language', () => {
    state().loadSavedAnswers({ code: { selectedOptionIds: [], textResponse: 'old', state: QuestionState.VISITED, savedAt: Date.parse(java.savedAt) - 1000 } });
    state().loadCodeSubmissions([java]);
    expect(state().answers.code.textResponse).toBe(encodeCodeDraft(CodeLanguage.JAVA, java.code));
    expect(state().codeDirtySinceSubmit.code).toBe(false);
  });
});
