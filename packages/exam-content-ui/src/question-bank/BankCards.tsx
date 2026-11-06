/**
 * Owner: Person B. The bank's card navigation, in the style of LeetCode
 * Explore / HackerRank Prepare: first a grid of topic cards (All, each topic,
 * Uncategorised, + New topic) with their question counts; opening one shows
 * question-type cards (All types, Single choice, ..., Coding) above its list.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { NO_TOPIC, QuestionType, type TopicCounts, type TopicSummary } from '@secure-exam/types';
import { errorMessage } from '../api/ExamContentApi';
import { Button, cx, Input } from '../ui';
import { ALL_TOPICS } from './bankQuery';
import { useBankMutations } from './hooks';
import { TYPE_LABEL, UNCATEGORISED } from './labels';

/** The counts for an opened topic (ALL_TOPICS/undefined = all, NO_TOPIC = without a topic). */
export function countsFor(summary: TopicSummary | undefined, topicId: string | undefined): TopicCounts | undefined {
  if (!summary) return undefined;
  if (!topicId || topicId === ALL_TOPICS) return summary.all;
  if (topicId === NO_TOPIC) return summary.uncategorised;
  return summary.topics.find((t) => t.id === topicId) ?? { total: 0, byType: {} };
}

/** Display name of an opened topic. */
export function topicName(summary: TopicSummary | undefined, topicId: string): string {
  if (topicId === ALL_TOPICS) return 'All questions';
  if (topicId === NO_TOPIC) return UNCATEGORISED;
  return summary?.topics.find((t) => t.id === topicId)?.name ?? 'Topic';
}

/** Accent stripe per card, from the theme so it follows light/dark mode. */
const ACCENTS = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-warning', 'bg-success', 'bg-destructive'];

const TYPE_SHORT: Record<QuestionType, string> = {
  [QuestionType.MCQ_SINGLE]: 'Single',
  [QuestionType.MCQ_MULTI]: 'Multi',
  [QuestionType.TRUE_FALSE]: 'T/F',
  [QuestionType.CODING]: 'Coding',
};

const plural = (n: number) => `${n} question${n === 1 ? '' : 's'}`;

function TopicCard({
  name,
  counts,
  accent,
  onOpen,
  muted,
}: {
  name: string;
  counts: TopicCounts | undefined;
  accent: string;
  onOpen: () => void;
  muted?: boolean;
}) {
  const types = Object.values(QuestionType).filter((t) => (counts?.byType[t] ?? 0) > 0);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cx(
          'group relative flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card p-4 pt-5 text-left shadow-sm',
          'transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span aria-hidden className={cx('absolute inset-x-0 top-0 h-1.5', accent)} />
        <span className={cx('text-base font-semibold', muted ? 'text-muted-foreground' : 'text-foreground')}>{name}</span>
        <span className="mt-1 text-sm text-muted-foreground">{counts ? plural(counts.total) : '…'}</span>
        <span className="mt-3 flex min-h-[1.5rem] flex-wrap gap-1">
          {types.map((t) => (
            <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
              {TYPE_SHORT[t]} {counts!.byType[t]}
            </span>
          ))}
        </span>
        <span className="mt-3 text-sm font-medium text-primary group-hover:underline">Open →</span>
      </button>
    </li>
  );
}

function NewTopicCard({ courseId, onCreated }: { courseId?: string; onCreated: (topicId: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { createTopic } = useBankMutations();

  const cancel = () => {
    setAdding(false);
    setName('');
    setError(null);
  };
  const add = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    try {
      const topic = await createTopic.mutateAsync({ name: trimmed, courseId: courseId ?? null });
      cancel();
      onCreated(topic.id);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <li>
      {adding ? (
        <form onSubmit={add} className="flex h-full flex-col gap-2 rounded-lg border border-dashed border-primary bg-card p-4">
          <span className="text-sm font-medium text-foreground">New topic</span>
          <Input
            aria-label="New topic name"
            placeholder="e.g. Binary search"
            maxLength={100}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="mt-auto flex gap-2">
            <Button size="sm" variant="primary" type="submit" disabled={!name.trim()} busy={createTopic.isPending}>
              Add
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex h-full min-h-[9rem] w-full items-center justify-center rounded-lg border border-dashed border-border text-sm font-medium text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          + New topic
        </button>
      )}
    </li>
  );
}

/** Level 1: one card per topic. */
export function TopicCards({
  summary,
  onOpen,
  courseId,
}: {
  summary: TopicSummary | undefined;
  onOpen: (topicId: string) => void;
  /** New topics are created in this course (or without a course). */
  courseId?: string;
}) {
  return (
    <nav aria-label="Topics">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <TopicCard name="All questions" counts={summary?.all} accent="bg-primary" onOpen={() => onOpen(ALL_TOPICS)} />
        {(summary?.topics ?? []).map((t, i) => (
          <TopicCard key={t.id} name={t.name} counts={t} accent={ACCENTS[i % ACCENTS.length]} onOpen={() => onOpen(t.id)} />
        ))}
        {(summary?.uncategorised.total ?? 0) > 0 && (
          <TopicCard name={UNCATEGORISED} counts={summary?.uncategorised} accent="bg-muted-foreground" muted onOpen={() => onOpen(NO_TOPIC)} />
        )}
        <NewTopicCard courseId={courseId} onCreated={onOpen} />
      </ul>
    </nav>
  );
}

const TYPE_ICON: Record<QuestionType | 'ALL', ReactNode> = {
  ALL: <path d="M4 5h16M4 12h16M4 19h16" />,
  [QuestionType.MCQ_SINGLE]: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </>
  ),
  [QuestionType.MCQ_MULTI]: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  [QuestionType.TRUE_FALSE]: <path d="m4 13 4 4 6-9M14 14l6 6M20 14l-6 6" />,
  [QuestionType.CODING]: <path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14" />,
};

/** Level 2: All types · Single choice · Multiple choice · True / False · Coding, with counts in the opened topic. */
export function TypeCards({
  counts,
  selected,
  onSelect,
}: {
  counts: TopicCounts | undefined;
  selected: QuestionType | undefined;
  onSelect: (type: QuestionType | undefined) => void;
}) {
  const cards: Array<{ type: QuestionType | undefined; label: string; count: number | undefined }> = [
    { type: undefined, label: 'All types', count: counts?.total },
    ...Object.values(QuestionType).map((type) => ({
      type,
      label: TYPE_LABEL[type],
      count: counts ? counts.byType[type] ?? 0 : undefined,
    })),
  ];
  return (
    <div role="tablist" aria-label="Question type" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => {
        const active = selected === c.type;
        return (
          <button
            key={c.label}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(c.type)}
            className={cx(
              'flex items-center gap-3 rounded-lg border p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'border-primary bg-accent ring-1 ring-primary' : 'border-border bg-card hover:border-primary hover:bg-muted',
            )}
          >
            <span
              aria-hidden
              className={cx(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                active ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
              )}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {TYPE_ICON[c.type ?? 'ALL']}
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">{c.label}</span>
              <span className="block text-xs text-muted-foreground">{c.count === undefined ? '…' : plural(c.count)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
