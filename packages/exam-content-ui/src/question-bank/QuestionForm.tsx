/**
 * Owner: Person B. Create or edit a bank question (MCQ, True/False, Coding).
 *
 * - New question: everything editable; saves with POST.
 * - Existing, unlocked: everything editable; saves the whole question (PUT).
 * - Existing, locked (in an ACTIVE/CLOSED exam): content is read-only;
 *   only course/topic/difficulty/status/tags save (PATCH meta). "Duplicate"
 *   makes an editable copy.
 */
import { useEffect, useState, type FormEvent } from 'react';
import {
  QuestionDifficulty,
  QuestionStatus,
  QuestionType,
  type BankQuestionDetail,
  type CodingProblemInput,
  type CreateOptionRequest,
  type SaveBankQuestionRequest,
} from '@secure-exam/types';
import { errorMessage } from '../api/ExamContentApi';
import { CodingProblemEditor, EMPTY_PROBLEM } from '../coding/authoring/CodingProblemEditor';
import { Alert, Button, Field, Input, Select, Spinner, Textarea } from '../ui';
import { useBankMutations, useBankQuestion, useTopics } from './hooks';
import { DIFFICULTY_LABEL, STATUS_LABEL, TYPE_LABEL, type CourseOption } from './labels';
import { OptionEditor, defaultOptionsFor, optionsError } from './OptionEditor';
import { TagInput } from './TagInput';

interface FormState {
  text: string;
  type: QuestionType;
  marks: number;
  negativeMarks: string;
  explanation: string;
  courseId: string;
  topicId: string;
  difficulty: QuestionDifficulty | '';
  status: QuestionStatus;
  tags: string[];
  options: CreateOptionRequest[];
  coding: CodingProblemInput;
}

const NEW_FORM: FormState = {
  text: '',
  type: QuestionType.MCQ_SINGLE,
  marks: 1,
  negativeMarks: '',
  explanation: '',
  courseId: '',
  topicId: '',
  difficulty: '',
  status: QuestionStatus.READY,
  tags: [],
  options: defaultOptionsFor(QuestionType.MCQ_SINGLE),
  coding: EMPTY_PROBLEM,
};

function fromDetail(q: BankQuestionDetail): FormState {
  return {
    text: q.text,
    type: q.type,
    marks: q.marks,
    negativeMarks: q.negativeMarks == null ? '' : String(q.negativeMarks),
    explanation: q.explanation ?? '',
    courseId: q.courseId ?? '',
    topicId: q.topicId ?? '',
    difficulty: q.difficulty ?? '',
    status: q.status,
    tags: q.tags,
    options:
      q.type === QuestionType.CODING
        ? defaultOptionsFor(QuestionType.MCQ_SINGLE)
        : q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect, order: o.order })),
    coding: q.coding
      ? {
          statementMd: q.coding.statementMd,
          starterCode: q.coding.starterCode,
          timeLimitMs: q.coding.timeLimitMs,
          memoryLimitMb: q.coding.memoryLimitMb,
          comparisonMode: q.coding.comparisonMode,
          referenceSolution: q.coding.referenceSolution ?? '',
          tests: q.coding.tests.map((t) => ({
            input: t.input,
            expectedOutput: t.expectedOutput,
            isSample: t.isSample,
            weight: t.weight,
          })),
        }
      : EMPTY_PROBLEM,
  };
}

export function toRequest(f: FormState): SaveBankQuestionRequest {
  const base: SaveBankQuestionRequest = {
    text: f.text.trim(),
    type: f.type,
    marks: f.marks,
    negativeMarks: f.negativeMarks === '' ? null : Number(f.negativeMarks),
    explanation: f.explanation.trim() || null,
    courseId: f.courseId || null,
    topicId: f.topicId || null,
    difficulty: f.difficulty || null,
    status: f.status,
    tags: f.tags,
  };
  if (f.type === QuestionType.CODING) {
    return { ...base, coding: { ...f.coding, referenceSolution: f.coding.referenceSolution || null } };
  }
  return { ...base, options: f.options.map((o, i) => ({ ...o, text: o.text.trim(), order: i })) };
}

/** Client-side checks that mirror the API; null when valid. */
export function formError(f: FormState): string | null {
  if (!f.text.trim()) return 'Question text is required.';
  if (!Number.isFinite(f.marks) || f.marks < 0) return 'Marks must be 0 or more.';
  if (f.negativeMarks !== '' && !(Number(f.negativeMarks) >= 0)) return 'Negative marks must be 0 or more.';
  if (f.type === QuestionType.CODING) {
    if (!f.coding.statementMd.trim()) return 'The coding problem needs a statement.';
    if (f.coding.tests.length === 0) return 'Add at least one test case.';
    return null;
  }
  return optionsError(f.type, f.options);
}

export function QuestionForm({
  questionId,
  courses,
  onSaved,
  onCancel,
  onDuplicated,
}: {
  /** Omit to create a new question. */
  questionId?: string;
  /** Person A's courses, if the host has them; hides the course picker otherwise. */
  courses?: CourseOption[];
  onSaved: (q: BankQuestionDetail) => void;
  onCancel: () => void;
  /** Called with the copy after "Duplicate" on a locked question. */
  onDuplicated?: (q: BankQuestionDetail) => void;
}) {
  const detail = useBankQuestion(questionId);
  const [form, setForm] = useState<FormState>(NEW_FORM);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [newTopic, setNewTopic] = useState('');
  const topics = useTopics(form.courseId || undefined);
  const m = useBankMutations();

  useEffect(() => {
    if (detail.data) setForm(fromDetail(detail.data));
  }, [detail.data]);

  if (questionId && detail.isLoading) return <Spinner />;
  if (questionId && detail.isError) return <Alert>{errorMessage(detail.error)}</Alert>;

  const locked = !!detail.data?.locked;
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  /** MCQ ↔ multi keeps the options; anything involving True/False or Coding starts fresh. */
  const changeType = (type: QuestionType) => {
    const choice = (t: QuestionType) => t === QuestionType.MCQ_SINGLE || t === QuestionType.MCQ_MULTI;
    if (!(choice(form.type) && choice(type))) {
      set({ type, options: defaultOptionsFor(type) });
      return;
    }
    const firstCorrect = form.options.findIndex((o) => o.isCorrect);
    set({
      type,
      options:
        type === QuestionType.MCQ_SINGLE
          ? form.options.map((o, i) => ({ ...o, isCorrect: i === Math.max(0, firstCorrect) }))
          : form.options,
    });
  };

  const validation = locked ? null : formError(form);
  const saving = m.create.isPending || m.replace.isPending || m.updateMeta.isPending;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setServerError(null);
    if (validation) return;
    try {
      let saved: BankQuestionDetail;
      if (!questionId) saved = await m.create.mutateAsync(toRequest(form));
      else if (locked)
        saved = await m.updateMeta.mutateAsync({
          id: questionId,
          data: {
            courseId: form.courseId || null,
            topicId: form.topicId || null,
            difficulty: form.difficulty || null,
            status: form.status,
            tags: form.tags,
          },
        });
      else saved = await m.replace.mutateAsync({ id: questionId, data: toRequest(form) });
      onSaved(saved);
    } catch (err) {
      setServerError(errorMessage(err));
    }
  };

  const addTopic = async () => {
    const name = newTopic.trim();
    if (!name) return;
    try {
      const t = await m.createTopic.mutateAsync({ name, courseId: form.courseId || null });
      set({ topicId: t.id });
      setNewTopic('');
    } catch (err) {
      setServerError(errorMessage(err));
    }
  };

  const duplicate = async () => {
    if (!questionId) return;
    try {
      const copy = await m.duplicate.mutateAsync(questionId);
      onDuplicated?.(copy);
    } catch (err) {
      setServerError(errorMessage(err));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {locked && (
        <Alert tone="amber">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              This question is in an exam that has started, so its content is locked. You can still change the
              course, topic, difficulty, status and tags.
            </span>
            {onDuplicated && (
              <Button size="sm" onClick={duplicate} busy={m.duplicate.isPending}>
                Duplicate to edit
              </Button>
            )}
          </div>
        </Alert>
      )}

      <section className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
        <Field label="Type">
          {(id) => (
            <Select
              id={id}
              value={form.type}
              disabled={locked || !!questionId}
              onChange={(e) => changeType(e.target.value as QuestionType)}
            >
              {Object.values(QuestionType).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Marks">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={0}
              step={0.5}
              className="w-28"
              value={form.marks}
              disabled={locked}
              onChange={(e) => set({ marks: Number(e.target.value) })}
            />
          )}
        </Field>
        {form.type !== QuestionType.CODING && (
          <Field label="Negative marks" hint="Stored; not applied yet">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={0}
                step={0.25}
                className="w-28"
                value={form.negativeMarks}
                disabled={locked}
                onChange={(e) => set({ negativeMarks: e.target.value })}
              />
            )}
          </Field>
        )}
      </section>

      <Field label={form.type === QuestionType.CODING ? 'Title' : 'Question'}>
        {(id) =>
          form.type === QuestionType.CODING ? (
            <Input id={id} value={form.text} disabled={locked} onChange={(e) => set({ text: e.target.value })} />
          ) : (
            <Textarea
              id={id}
              rows={3}
              className="font-sans"
              value={form.text}
              disabled={locked}
              onChange={(e) => set({ text: e.target.value })}
            />
          )
        }
      </Field>

      {form.type === QuestionType.CODING ? (
        <CodingProblemEditor value={form.coding} onChange={(coding) => set({ coding })} disabled={locked} />
      ) : (
        <>
          <div className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Options</span>
            <OptionEditor type={form.type} options={form.options} onChange={(options) => set({ options })} disabled={locked} />
          </div>
          <Field label="Explanation (optional)" hint="Admin-only for now">
            {(id) => (
              <Textarea
                id={id}
                rows={2}
                className="font-sans"
                value={form.explanation}
                disabled={locked}
                onChange={(e) => set({ explanation: e.target.value })}
              />
            )}
          </Field>
        </>
      )}

      <section className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold text-slate-900">Organize</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {courses && (
            <Field label="Course">
              {(id) => (
                <Select id={id} value={form.courseId} onChange={(e) => set({ courseId: e.target.value, topicId: '' })}>
                  <option value="">No course</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Field label="Topic">
            {(id) => (
              <Select id={id} value={form.topicId} onChange={(e) => set({ topicId: e.target.value })}>
                <option value="">No topic</option>
                {(topics.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Difficulty">
            {(id) => (
              <Select
                id={id}
                value={form.difficulty}
                onChange={(e) => set({ difficulty: e.target.value as QuestionDifficulty | '' })}
              >
                <option value="">Not set</option>
                {Object.values(QuestionDifficulty).map((d) => (
                  <option key={d} value={d}>
                    {DIFFICULTY_LABEL[d].text}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Status" hint="Only Ready questions can be added to exams">
            {(id) => (
              <Select id={id} value={form.status} onChange={(e) => set({ status: e.target.value as QuestionStatus })}>
                {Object.values(QuestionStatus).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s].text}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="flex items-end gap-2">
          <Field label="New topic" className="flex-1">
            {(id) => (
              <Input
                id={id}
                value={newTopic}
                placeholder="e.g. Recursion"
                onChange={(e) => setNewTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void addTopic();
                  }
                }}
              />
            )}
          </Field>
          <Button onClick={addTopic} disabled={!newTopic.trim()} busy={m.createTopic.isPending}>
            Add topic
          </Button>
        </div>
        <div className="space-y-1">
          <span className="text-sm font-medium text-slate-700">Tags</span>
          <TagInput value={form.tags} onChange={(tags) => set({ tags })} />
        </div>
      </section>

      {touched && validation && <Alert>{validation}</Alert>}
      {serverError && <Alert>{serverError}</Alert>}

      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" busy={saving}>
          {!questionId ? 'Create question' : locked ? 'Save details' : 'Save question'}
        </Button>
      </div>
    </form>
  );
}
