/** Owner: Person B. Search + filter bar shared by the bank page and the exam picker. */
import { useEffect, useState } from 'react';
import { QuestionDifficulty, QuestionStatus, QuestionType, type BankQuestionQuery } from '@secure-exam/types';
import { Input, Select } from '../ui';
import { useTopics } from './hooks';
import { DIFFICULTY_LABEL, STATUS_LABEL, TYPE_LABEL, type CourseOption } from './labels';

export function BankFilters({
  query,
  onChange,
  courses,
  hideStatus,
}: {
  query: BankQuestionQuery;
  onChange: (q: BankQuestionQuery) => void;
  courses?: CourseOption[];
  hideStatus?: boolean;
}) {
  const [search, setSearch] = useState(query.search ?? '');
  const topics = useTopics(query.courseId);

  // Debounce typing; filters below apply immediately.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((query.search ?? '') !== search) onChange({ ...query, search: search || undefined, page: 1 });
    }, 300);
    return () => clearTimeout(t);
  }, [search, query, onChange]);

  const set = (patch: Partial<BankQuestionQuery>) => onChange({ ...query, ...patch, page: 1 });
  const val = (v: string) => v || undefined;

  return (
    <div className="flex flex-wrap gap-2">
      <Input
        aria-label="Search questions"
        placeholder="Search question text…"
        className="min-w-[200px] flex-1"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {courses && (
        <Select
          aria-label="Course"
          className="w-auto"
          value={query.courseId ?? ''}
          onChange={(e) => set({ courseId: val(e.target.value), topicId: undefined })}
        >
          <option value="">All courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      )}
      <Select aria-label="Topic" className="w-auto" value={query.topicId ?? ''} onChange={(e) => set({ topicId: val(e.target.value) })}>
        <option value="">All topics</option>
        {(topics.data ?? []).map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Type"
        className="w-auto"
        value={query.type ?? ''}
        onChange={(e) => set({ type: val(e.target.value) as QuestionType | undefined })}
      >
        <option value="">All types</option>
        {Object.values(QuestionType).map((t) => (
          <option key={t} value={t}>
            {TYPE_LABEL[t]}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Difficulty"
        className="w-auto"
        value={query.difficulty ?? ''}
        onChange={(e) => set({ difficulty: val(e.target.value) as QuestionDifficulty | undefined })}
      >
        <option value="">Any difficulty</option>
        {Object.values(QuestionDifficulty).map((d) => (
          <option key={d} value={d}>
            {DIFFICULTY_LABEL[d].text}
          </option>
        ))}
      </Select>
      {!hideStatus && (
        <Select
          aria-label="Status"
          className="w-auto"
          value={query.status ?? ''}
          onChange={(e) => set({ status: val(e.target.value) as QuestionStatus | undefined })}
        >
          <option value="">Any status</option>
          {Object.values(QuestionStatus).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s].text}
            </option>
          ))}
        </Select>
      )}
      <Input
        aria-label="Tag"
        placeholder="Tag"
        className="w-32"
        value={query.tag ?? ''}
        onChange={(e) => set({ tag: val(e.target.value.trim().toLowerCase()) })}
      />
    </div>
  );
}

export function Pager({
  page,
  limit,
  total,
  onPage,
}: {
  page: number;
  limit: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex items-center justify-between text-sm text-slate-600">
      <span>
        {total === 0 ? 'No questions' : `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total}`}
      </span>
      <span className="flex items-center gap-2">
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </span>
    </div>
  );
}
