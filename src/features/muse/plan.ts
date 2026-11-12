// The Muse plan pipeline: parse (model) -> candidates (code) -> rank + explain (model) ->
// validate (code). Returns the MusePlan plus per-step timing for logs and the UI.
import type { MusePlan } from '../../shared';
import { buildCandidates, type DroppedQuest } from './candidates';
import { isMockMode } from './client';
import { getPlanContextProvider, type PlanContext, type PlanContextProvider } from './context';
import { NOT_UNDERSTOOD_SUMMARY, summaryText } from './explain';
import { parseIntent } from './intent';
import { rankAndExplain } from './rank';
import { validate, type ValidationIssue } from './validate';

export type PlanInput = {
  text: string;
  /** Profile id or persona handle; null/undefined = demo driver. */
  userId?: string | null;
  location?: { lat: number; lng: number } | null;
  now?: Date;
  /** Use this provider instead of the registered one. */
  provider?: PlanContextProvider;
  /** Use this context directly (tests). */
  context?: PlanContext;
};

export type PlanTimings = { contextMs: number; parseMs: number; candidatesMs: number; rankMs: number; validateMs: number; totalMs: number };

export type PlanMeta = {
  mode: 'mock' | 'live';
  understood: boolean;
  models: { parse: string; rank: string };
  rankFallback: boolean;
  rankError: string | null;
  candidateCount: number;
  dropped: DroppedQuest[];
  issues: ValidationIssue[];
  timings: PlanTimings;
};

export type PlanOutput = { plan: MusePlan; meta: PlanMeta };

const MOCK_PREFIX = '[mock] ';

export async function plan(input: PlanInput): Promise<PlanOutput> {
  const t0 = Date.now();
  const now = input.now ?? new Date();
  const mock = isMockMode();
  const ctx = input.context ?? await (input.provider ?? await getPlanContextProvider()).getPlanContext({
    userId: input.userId ?? null,
    location: input.location ?? null,
    now,
  });
  const t1 = Date.now();

  const parsed = await parseIntent(input.text, now, ctx.viewer);
  const t2 = Date.now();
  const label = (s: string) => (mock ? `${MOCK_PREFIX}${s}` : s);

  const base = (rest: Partial<PlanMeta>, t: Partial<PlanTimings>): PlanMeta => ({
    mode: mock ? 'mock' : 'live',
    understood: parsed.understood,
    models: { parse: parsed.model, rank: 'none' },
    rankFallback: false,
    rankError: null,
    candidateCount: 0,
    dropped: [],
    issues: [],
    ...rest,
    timings: {
      contextMs: t1 - t0, parseMs: t2 - t1, candidatesMs: 0, rankMs: 0, validateMs: 0,
      totalMs: Date.now() - t0, ...t,
    },
  });

  if (!parsed.understood) {
    return {
      plan: { intent: parsed.intent, suggestions: [], summary: label(NOT_UNDERSTOOD_SUMMARY) },
      meta: base({}, {}),
    };
  }

  const result = buildCandidates({
    intent: parsed.intent, viewer: ctx.viewer, friends: ctx.friends,
    friendAvailability: ctx.friendAvailability, quests: ctx.quests, location: ctx.location, now,
  });
  const t3 = Date.now();

  if (result.candidates.length === 0) {
    const summary = summaryText([], parsed.intent, result.friendsFree.map((f) => f.firstName));
    return {
      plan: { intent: parsed.intent, suggestions: [], summary: label(summary) },
      meta: base({ dropped: result.dropped }, { candidatesMs: t3 - t2, totalMs: Date.now() - t0 }),
    };
  }

  const ranked = await rankAndExplain(parsed.intent, result, { viewer: ctx.viewer, now, text: input.text });
  const t4 = Date.now();
  const checked = validate(ranked.suggestions, result.candidates, ctx);
  const t5 = Date.now();

  const summary = checked.suggestions.length > 0
    ? ranked.summary
    : summaryText([], parsed.intent, result.friendsFree.map((f) => f.firstName));
  return {
    plan: { intent: parsed.intent, suggestions: checked.suggestions, summary: label(summary) },
    meta: base(
      {
        models: { parse: parsed.model, rank: ranked.model },
        rankFallback: ranked.fallback,
        rankError: ranked.error,
        candidateCount: result.candidates.length,
        dropped: result.dropped,
        issues: checked.issues,
      },
      { candidatesMs: t3 - t2, rankMs: t4 - t3, validateMs: t5 - t4, totalMs: t5 - t0 },
    ),
  };
}
