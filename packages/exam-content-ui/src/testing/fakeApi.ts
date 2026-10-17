/**
 * Owner: Person B. In-memory ExamContentApi for tests and the playground.
 * Mirrors the API's rules that the UI depends on (filters, paging, locks,
 * READY-only bulk add). The fake runner does not execute code.
 */
import {
  AttemptStatus,
  CodeLanguage,
  QuestionCellState,
  CodeRunKind,
  CodeSubmissionStatus,
  ExecutionStatus,
  OutputComparisonMode,
  QuestionDifficulty,
  QuestionStatus,
  QuestionType,
  TestCaseVerdict,
  type AttemptDrilldown,
  type BankQuestionDetail,
  type QuestionAnalyticsMatrix,
  type BankQuestionQuery,
  type PublicQuestion,
  type SaveBankQuestionRequest,
  type Topic,
} from '@secure-exam/types';
import type { ExamContentApi } from '../api/ExamContentApi';

let seq = 0;
const id = (p: string) => `${p}-${++seq}`;

/** Minimal axios-like error so errorMessage()/errorStatus() work. */
export function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { response: { status, data: { message } } });
}

function detailFrom(req: SaveBankQuestionRequest, qid: string, topics: Topic[], prev?: BankQuestionDetail): BankQuestionDetail {
  const now = new Date().toISOString();
  return {
    id: qid,
    text: req.text,
    type: req.type,
    marks: req.marks,
    courseId: req.courseId ?? null,
    topicId: req.topicId ?? null,
    topicName: topics.find((t) => t.id === req.topicId)?.name ?? null,
    difficulty: req.difficulty ?? null,
    status: req.status ?? QuestionStatus.READY,
    tags: [...new Set((req.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))].sort(),
    usedInExams: prev?.usedInExams ?? 0,
    locked: prev?.locked ?? false,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    negativeMarks: req.negativeMarks ?? null,
    explanation: req.explanation ?? null,
    options: (req.options ?? []).map((o, i) => ({ id: id('opt'), questionId: qid, text: o.text, isCorrect: o.isCorrect, order: i })),
    coding: req.coding
      ? {
          statementMd: req.coding.statementMd,
          starterCode: req.coding.starterCode ?? {},
          allowedLanguages: [CodeLanguage.PYTHON],
          timeLimitMs: req.coding.timeLimitMs ?? 2000,
          memoryLimitMb: req.coding.memoryLimitMb ?? 256,
          comparisonMode: req.coding.comparisonMode ?? OutputComparisonMode.TRIM,
          referenceSolution: req.coding.referenceSolution ?? null,
          tests: req.coding.tests.map((t, i) => ({ id: id('test'), ...t, weight: t.weight ?? 1, order: i })),
        }
      : null,
  };
}

export interface FakeState {
  questions: BankQuestionDetail[];
  topics: Topic[];
  /** examId -> question ids in order */
  exams: Record<string, string[]>;
}

export function seedState(): FakeState {
  const topics: Topic[] = [
    { id: 'topic-loops', courseId: null, name: 'Loops' },
    { id: 'topic-lists', courseId: null, name: 'Lists' },
  ];
  const mk = (qid: string, req: SaveBankQuestionRequest, extra: Partial<BankQuestionDetail> = {}) => ({
    ...detailFrom(req, qid, topics),
    ...extra,
  });
  const questions = [
    mk(
      'q-mcq',
      {
        text: 'Which keyword starts a loop over a sequence in Python?',
        type: QuestionType.MCQ_SINGLE,
        marks: 1,
        topicId: 'topic-loops',
        difficulty: QuestionDifficulty.EASY,
        tags: ['python', 'syntax'],
        options: [
          { text: 'for', isCorrect: true, order: 0 },
          { text: 'foreach', isCorrect: false, order: 1 },
          { text: 'loop', isCorrect: false, order: 2 },
        ],
      },
      { usedInExams: 1, locked: true },
    ),
    mk('q-tf', {
      text: 'Lists in Python are mutable.',
      type: QuestionType.TRUE_FALSE,
      marks: 1,
      topicId: 'topic-lists',
      difficulty: QuestionDifficulty.EASY,
      tags: ['python'],
      options: [
        { text: 'True', isCorrect: true, order: 0 },
        { text: 'False', isCorrect: false, order: 1 },
      ],
    }),
    mk('q-coding', {
      text: 'Sum of a list',
      type: QuestionType.CODING,
      marks: 10,
      topicId: 'topic-lists',
      difficulty: QuestionDifficulty.MEDIUM,
      tags: ['python', 'lists'],
      coding: {
        statementMd:
          'Read a line of space-separated integers and print their **sum**.\n\n### Input\nOne line with up to 1000 integers.\n\n### Output\nA single integer.',
        starterCode: { python: 'nums = list(map(int, input().split()))\n' },
        referenceSolution: 'print(sum(map(int, input().split())))',
        tests: [
          { input: '1 2 3', expectedOutput: '6', isSample: true },
          { input: '10 -4', expectedOutput: '6', isSample: true },
          { input: '100 200 300', expectedOutput: '600', isSample: false, weight: 2 },
        ],
      },
    }),
    mk('q-multi', {
      text: 'Which of these are immutable?',
      type: QuestionType.MCQ_MULTI,
      marks: 2,
      difficulty: QuestionDifficulty.HARD,
      status: QuestionStatus.DRAFT,
      options: [
        { text: 'tuple', isCorrect: true, order: 0 },
        { text: 'list', isCorrect: false, order: 1 },
        { text: 'str', isCorrect: true, order: 2 },
      ],
    }),
  ];
  return { questions, topics, exams: { 'exam-demo': [questions[0].id] } };
}

/** The coding question as a student would receive it (samples only). */
export function publicCodingQuestion(state: FakeState): PublicQuestion {
  const q = state.questions.find((x) => x.type === QuestionType.CODING)!;
  return {
    id: q.id,
    text: q.text,
    type: q.type,
    marks: q.marks,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    options: [],
    coding: {
      statementMd: q.coding!.statementMd,
      starterCode: q.coding!.starterCode,
      allowedLanguages: q.coding!.allowedLanguages,
      timeLimitMs: q.coding!.timeLimitMs,
      memoryLimitMb: q.coding!.memoryLimitMb,
      samples: q.coding!.tests
        .filter((t) => t.isSample)
        .map((t, i) => ({ index: i + 1, input: t.input, expectedOutput: t.expectedOutput })),
    },
  };
}

/** Question-wise results for 'exam-demo': three students over the seeded questions. */
export function fakeAnalytics(state: FakeState): QuestionAnalyticsMatrix {
  const [mcq, tf, coding] = ['q-mcq', 'q-tf', 'q-coding'].map((id) => state.questions.find((q) => q.id === id)!);
  const questions = [mcq, tf, coding].map((q, i) => ({
    id: q.id,
    number: i + 1,
    text: q.text,
    type: q.type,
    marks: q.marks,
    ...(q.type === QuestionType.CODING
      ? {}
      : { options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })) }),
  }));
  const S = QuestionCellState;
  const people: [string, string, AttemptStatus, [QuestionCellState, number | null][]][] = [
    ['Alice Johnson', 'alice@secure-exam.dev', AttemptStatus.SUBMITTED, [[S.CORRECT, 1], [S.WRONG, 0], [S.PARTIAL, 6.67]]],
    ['Bob Smith', 'bob@secure-exam.dev', AttemptStatus.AUTO_SUBMITTED, [[S.CORRECT, 1], [S.CORRECT, 1], [S.CORRECT, 10]]],
    ['Carol Williams', 'carol@secure-exam.dev', AttemptStatus.IN_PROGRESS, [[S.NOT_ANSWERED, 0], [S.CORRECT, 1], [S.PENDING, null]]],
  ];
  const students = people.map(([fullName, email, status, cells], i) => ({
    attemptId: `att-${i + 1}`,
    studentId: `user-${i + 1}`,
    fullName,
    email,
    status,
    startedAt: '2026-10-17T09:00:00.000Z',
    submittedAt: status === AttemptStatus.IN_PROGRESS ? null : '2026-10-17T10:00:00.000Z',
    score: cells.reduce((sum, [, sc]) => sum + (sc ?? 0), 0),
    maxScore: 12,
    answeredCount: cells.filter(([st]) => st !== S.NOT_ANSWERED).length,
  }));
  const cells = people.flatMap(([, , , c], i) =>
    c.map(([st, sc], j) => ({
      attemptId: `att-${i + 1}`,
      questionId: questions[j].id,
      state: st,
      score: sc,
      maxScore: questions[j].marks,
      markedForReview: i === 2 && j === 0,
    })),
  );
  const stats = questions.map((q) => {
    const qc = cells.filter((c) => c.questionId === q.id);
    const graded = qc.filter((c) => c.score !== null);
    const n = (st: QuestionCellState) => qc.filter((c) => c.state === st).length;
    return {
      questionId: q.id,
      attempts: qc.length,
      answered: qc.length - n(S.NOT_ANSWERED),
      correct: n(S.CORRECT),
      partial: n(S.PARTIAL),
      wrong: n(S.WRONG),
      notAnswered: n(S.NOT_ANSWERED),
      pending: n(S.PENDING),
      averageScore: graded.length ? Math.round((graded.reduce((x, c) => x + (c.score ?? 0), 0) / graded.length) * 100) / 100 : null,
      accuracy: graded.length ? Math.round((n(S.CORRECT) / graded.length) * 100) / 100 : null,
      ...(q.options ? { optionCounts: Object.fromEntries(q.options.map((o, k) => [o.id, k === 0 ? 2 : k === 1 ? 1 : 0])) } : {}),
      ...(q.type === QuestionType.CODING ? { testPassRate: 0.83 } : {}),
    };
  });
  return { exam: { id: 'exam-demo', title: 'Python basics', status: 'CLOSED' }, questions, students, cells, stats };
}

export function fakeDrilldown(state: FakeState, attemptId: string): AttemptDrilldown {
  const m = fakeAnalytics(state);
  const student = m.students.find((s) => s.attemptId === attemptId);
  if (!student) throw httpError(404, 'Attempt not found for this exam');
  const coding = state.questions.find((q) => q.id === 'q-coding')!;
  return {
    exam: { id: m.exam.id, title: m.exam.title },
    student,
    questions: m.questions.map((q) => {
      const c = m.cells.find((x) => x.attemptId === attemptId && x.questionId === q.id)!;
      const { options: _options, ...question } = q;
      const base = { ...question, state: c.state, score: c.score, markedForReview: c.markedForReview, answeredAt: null };
      if (q.type !== QuestionType.CODING) {
        return {
          ...base,
          options: q.options!.map((o, k) => ({
            ...o,
            selected: c.state === QuestionCellState.NOT_ANSWERED ? false : c.state === QuestionCellState.CORRECT ? o.isCorrect : k === 1,
          })),
        };
      }
      return {
        ...base,
        code:
          c.state === QuestionCellState.PENDING
            ? { code: 'nums = list(map(int, input().split()))\nprint(sum(nums))', language: CodeLanguage.PYTHON, source: 'DRAFT' as const, status: null, passed: 0, total: 0, tests: [], submitCount: 0, runCount: 3 }
            : {
                code: 'print(sum(map(int, input().split())))',
                language: CodeLanguage.PYTHON,
                source: 'FINAL_SUBMIT' as const,
                status: CodeSubmissionStatus.GRADED,
                passed: c.state === QuestionCellState.CORRECT ? 3 : 2,
                total: 3,
                submitCount: 2,
                runCount: 5,
                tests: coding.coding!.tests.map((t, k) => ({
                  index: k + 1,
                  isSample: t.isSample,
                  verdict: c.state === QuestionCellState.CORRECT || k < 2 ? TestCaseVerdict.PASSED : TestCaseVerdict.WRONG_ANSWER,
                  weight: t.weight,
                  timeMs: 20,
                  input: t.input,
                  expectedOutput: t.expectedOutput,
                  stdout: c.state === QuestionCellState.CORRECT || k < 2 ? `${t.expectedOutput}\n` : '0\n',
                  stderr: '',
                })),
              },
      };
    }),
  };
}

export function createFakeApi(state: FakeState = seedState(), opts: { latencyMs?: number } = {}): ExamContentApi {
  const wait = <T>(v: T): Promise<T> =>
    new Promise((r) => (opts.latencyMs ? setTimeout(() => r(v), opts.latencyMs) : r(v)));
  const find = (qid: string) => {
    const q = state.questions.find((x) => x.id === qid);
    if (!q) throw httpError(404, `Question ${qid} not found`);
    return q;
  };
  const summary = (q: BankQuestionDetail) => {
    const { negativeMarks: _n, explanation: _e, options: _o, coding: _c, ...s } = q;
    return s;
  };

  return {
    async listBankQuestions(query: BankQuestionQuery) {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const term = query.search?.toLowerCase();
      const items = state.questions.filter(
        (q) =>
          (!term || q.text.toLowerCase().includes(term)) &&
          (!query.type || q.type === query.type) &&
          (!query.status || q.status === query.status) &&
          (!query.difficulty || q.difficulty === query.difficulty) &&
          (!query.topicId || q.topicId === query.topicId) &&
          (!query.courseId || q.courseId === query.courseId) &&
          (!query.tag || q.tags.includes(query.tag)) &&
          (!query.excludeExamId || !(state.exams[query.excludeExamId] ?? []).includes(q.id)),
      );
      return wait({ items: items.slice((page - 1) * limit, page * limit).map(summary), total: items.length, page, limit });
    },
    async getBankQuestion(qid) {
      return wait(structuredClone(find(qid)));
    },
    async createBankQuestion(data) {
      const q = detailFrom(data, id('q'), state.topics);
      state.questions.unshift(q);
      return wait(structuredClone(q));
    },
    async replaceBankQuestion(qid, data) {
      const prev = find(qid);
      if (prev.locked) throw httpError(409, 'This question is part of an exam that has started, so its content is locked.');
      const next = detailFrom(data, qid, state.topics, prev);
      state.questions = state.questions.map((q) => (q.id === qid ? next : q));
      return wait(structuredClone(next));
    },
    async updateBankQuestionMeta(qid, data) {
      const q = find(qid);
      if (data.courseId !== undefined) q.courseId = data.courseId;
      if (data.topicId !== undefined) {
        q.topicId = data.topicId;
        q.topicName = state.topics.find((t) => t.id === data.topicId)?.name ?? null;
      }
      if (data.difficulty !== undefined) q.difficulty = data.difficulty;
      if (data.status !== undefined) q.status = data.status;
      if (data.tags !== undefined) q.tags = [...new Set(data.tags.map((t) => t.toLowerCase()))].sort();
      return wait(structuredClone(q));
    },
    async duplicateBankQuestion(qid) {
      const src = find(qid);
      const copy: BankQuestionDetail = {
        ...structuredClone(src),
        id: id('q'),
        text: `${src.text} (copy)`,
        status: QuestionStatus.DRAFT,
        usedInExams: 0,
        locked: false,
      };
      state.questions.unshift(copy);
      return wait(structuredClone(copy));
    },
    async deleteBankQuestion(qid) {
      const q = find(qid);
      if (q.usedInExams > 0) throw httpError(409, 'This question is attached to one or more exams.');
      state.questions = state.questions.filter((x) => x.id !== qid);
      return wait(undefined);
    },
    async importBankQuestions(file) {
      const lines = (await file.text()).split(/\r?\n/).filter((l) => l.trim());
      return wait({ createdCount: Math.max(0, lines.length - 1), errors: [] });
    },
    async listTopics(courseId) {
      return wait(state.topics.filter((t) => !courseId || t.courseId === courseId));
    },
    async createTopic(data) {
      if (state.topics.some((t) => t.name.toLowerCase() === data.name.toLowerCase())) {
        throw httpError(409, `Topic "${data.name}" already exists`);
      }
      const t: Topic = { id: id('topic'), name: data.name, courseId: data.courseId ?? null };
      state.topics.push(t);
      return wait(t);
    },
    async listTags(search) {
      const counts = new Map<string, number>();
      for (const q of state.questions) for (const t of q.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
      return wait(
        [...counts.entries()]
          .filter(([t]) => !search || t.startsWith(search))
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
      );
    },
    async addBankQuestionsToExam(examId, ids) {
      const inExam = (state.exams[examId] ??= []);
      const added: string[] = [];
      const skipped: { questionId: string; reason: string }[] = [];
      for (const qid of [...new Set(ids)]) {
        const q = state.questions.find((x) => x.id === qid);
        if (!q) skipped.push({ questionId: qid, reason: 'Question not found' });
        else if (inExam.includes(qid)) skipped.push({ questionId: qid, reason: 'Already in this exam' });
        else if (q.status !== QuestionStatus.READY)
          skipped.push({ questionId: qid, reason: `Only READY questions can be added (this one is ${q.status})` });
        else {
          inExam.push(qid);
          q.usedInExams += 1;
          added.push(qid);
        }
      }
      return wait({ added, skipped });
    },
    async runCode(_attemptId, data) {
      if (data.kind === CodeRunKind.CUSTOM) {
        return wait({
          runId: id('run'),
          kind: data.kind,
          outcome: {
            status: ExecutionStatus.OK,
            stdout: `(fake runner: code is not executed)\nstdin was: ${data.stdin ?? ''}\n`,
            stderr: '',
            exitCode: 0,
            timeMs: 12,
          },
        });
      }
      const q = find(data.questionId);
      const pass = data.code.includes('sum(');
      return wait({
        runId: id('run'),
        kind: data.kind,
        samples: q
          .coding!.tests.filter((t) => t.isSample)
          .map((t, i) => ({
            index: i + 1,
            verdict: pass ? TestCaseVerdict.PASSED : TestCaseVerdict.WRONG_ANSWER,
            input: t.input,
            expectedOutput: t.expectedOutput,
            stdout: pass ? `${t.expectedOutput}\n` : '0\n',
            stderr: '',
            timeMs: 15,
          })),
      });
    },
    async submitCode(_attemptId, data) {
      const q = find(data.questionId);
      const tests = q.coding!.tests;
      const pass = data.code.includes('sum(');
      const total = tests.reduce((s, t) => s + t.weight, 0);
      const passedWeight = pass ? total : tests.filter((t) => t.isSample).reduce((s, t) => s + t.weight, 0) / 2;
      return wait({
        submissionId: id('sub'),
        status: CodeSubmissionStatus.GRADED,
        passed: pass ? tests.length : 1,
        total: tests.length,
        score: Math.round(((q.marks * passedWeight) / total) * 100) / 100,
        maxScore: q.marks,
        tests: tests.map((t, i) => ({
          index: i + 1,
          isSample: t.isSample,
          verdict: pass || i === 0 ? TestCaseVerdict.PASSED : TestCaseVerdict.WRONG_ANSWER,
          timeMs: 14,
        })),
      });
    },
    async getQuestionAnalytics(examId) {
      if (examId !== 'exam-demo') throw httpError(404, `Exam ${examId} not found`);
      return wait(fakeAnalytics(state));
    },
    async getAttemptDrilldown(_examId, attemptId) {
      return wait(fakeDrilldown(state, attemptId));
    },
  };
}
