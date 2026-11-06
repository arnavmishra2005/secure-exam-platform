/**
 * Owner: Person B. The bank's filters as URL query parameters, so a host app
 * can keep them in the address bar (Back and refresh keep the filters).
 */
import { QuestionDifficulty, QuestionStatus, QuestionType, type BankQuestionQuery } from '@secure-exam/types';

export const BANK_PAGE_SIZE = 20;

/**
 * `topicId` value for "the All questions card is open". The page shows the
 * topic cards while no topic is open; this is never sent to the API.
 */
export const ALL_TOPICS = 'all';

/** The query to send to the API: the page-only ALL_TOPICS marker removed. */
export function toApiQuery(query: BankQuestionQuery): BankQuestionQuery {
  if (query.topicId !== ALL_TOPICS) return query;
  const { topicId: _all, ...rest } = query;
  return rest;
}

const TEXT_KEYS = ['search', 'courseId', 'topicId', 'tag'] as const;

const oneOf = <T extends string>(values: readonly T[], v: string | null): T | undefined =>
  v !== null && (values as readonly string[]).includes(v) ? (v as T) : undefined;

/** Reads the bank filters from a URL query; unknown or invalid values are ignored. */
export function bankQueryFromParams(params: URLSearchParams): BankQuestionQuery {
  const query: BankQuestionQuery = { page: 1, limit: BANK_PAGE_SIZE };
  for (const key of TEXT_KEYS) {
    const v = params.get(key)?.trim();
    if (v) query[key] = v;
  }
  query.type = oneOf(Object.values(QuestionType), params.get('type'));
  query.difficulty = oneOf(Object.values(QuestionDifficulty), params.get('difficulty'));
  query.status = oneOf(Object.values(QuestionStatus), params.get('status'));
  const page = Number(params.get('page'));
  if (Number.isInteger(page) && page > 1) query.page = page;
  return dropEmpty(query);
}

/** The URL query for some bank filters: only set values, and no page or limit when they are the defaults. */
export function bankQueryToParams(query: BankQuestionQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of [...TEXT_KEYS, 'type', 'difficulty', 'status'] as const) {
    const v = query[key];
    if (v) params.set(key, v);
  }
  if (query.page && query.page > 1) params.set('page', String(query.page));
  return params;
}

function dropEmpty(query: BankQuestionQuery): BankQuestionQuery {
  return Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined)) as BankQuestionQuery;
}
