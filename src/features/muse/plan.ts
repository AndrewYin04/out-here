// The Muse plan pipeline: parse (model) -> candidates (code) -> rank + explain (model) ->
// validate (code). Returns the MusePlan plus per-step timing for logs and the UI.
import type { MusePlan } from '../../shared';
import { buildCandidates, questVisibleTo, type DroppedQuest } from './candidates';
import { isMockMode } from './client';
import { getPlanContextProvider, type PlanContext, type PlanContextProvider } from './context';
import { NOT_UNDERSTOOD_SUMMARY, summaryText } from './explain';
import { parseIntent } from './intent';
import { rankAndExplain } from './rank';
import { checkSummary, validate, type ValidationIssue } from './validate';

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

/**
 * Who produced this plan. UI rule: show the "✨ Muse" label only when source is "muse".
 * - "muse": live mode, and every model step that ran answered (parse, and rank when called).
 * - "fallback": live mode, but parse or rank failed or timed out and code answered.
 * - "mock": MUSE_MOCK=1 or no key; summaries also start with "[mock] ".
 */
export type PlanSource = 'muse' | 'fallback' | 'mock';

export type PlanMeta = {
  source: PlanSource;
  /** "muse" when the summary text is the model's, "code" when code wrote or replaced it. */
  summarySource: 'muse' | 'code';
  mode: 'mock' | 'live';
  understood: boolean;
  models: { parse: string; rank: string };
  rankFallback: boolean;
  rankError: string | null;
  parseError: string | null;
  /** Why the model's summary was replaced, if it was. */
  summaryIssue: string | null;
  budgetMs: number;
  candidateCount: number;
  /** Pre-check: how many friends' agents were asked (all friends; busy ones just answer nothing). */
  friendsChecked: number;
  /** Friends free in the window: first name and end time only, from availability they shared with the viewer. */
  friendsFree: { firstName: string; freeUntil: string }[];
  /** questId -> priceMax for the plans that fit, so the card's meta row needs no second fetch. */
  prices: Record<string, number>;
  dropped: DroppedQuest[];
  issues: ValidationIssue[];
  timings: PlanTimings;
};

export type PlanOutput = { plan: MusePlan; meta: PlanMeta };

const MOCK_PREFIX = '[mock] ';

/** Whole-pipeline budget; MUSE_PLAN_BUDGET_MS overrides it. */
export const PLAN_BUDGET_MS = 9_000;
/** Parse cap: the measured Ember call took 1.2 s (docs/muse-api.md). */
export const PARSE_BUDGET_MS = 3_000;
/** Rank gets the time left, capped here. */
export const RANK_BUDGET_MS = 6_000;

function planBudget(): number {
  const v = Number(process.env.MUSE_PLAN_BUDGET_MS);
  return Number.isFinite(v) && v > 0 ? v : PLAN_BUDGET_MS;
}

export async function plan(input: PlanInput): Promise<PlanOutput> {
  const t0 = Date.now();
  const now = input.now ?? new Date();
  const mock = isMockMode();
  const rawCtx = input.context ?? await (input.provider ?? await getPlanContextProvider()).getPlanContext({
    userId: input.userId ?? null,
    location: input.location ?? null,
    now,
  });
  // Re-apply quest visibility here, so nothing downstream (candidates, meta.dropped, claim
  // checks and their issue strings) ever sees a quest this viewer may not see.
  const friendIdSet = new Set(rawCtx.friends.map((f) => f.profile.id));
  const ctx: PlanContext = { ...rawCtx, quests: rawCtx.quests.filter((q) => questVisibleTo(q, rawCtx.viewer.id, friendIdSet)) };
  const t1 = Date.now();
  const budgetMs = planBudget();
  const deadline = t0 + budgetMs;

  const parsed = await parseIntent(input.text, now, ctx.viewer, {
    deadline: Math.min(deadline, Date.now() + PARSE_BUDGET_MS),
  });
  const parseFellBack = !mock && parsed.model === 'heuristic';
  const t2 = Date.now();
  const label = (s: string) => (mock ? `${MOCK_PREFIX}${s}` : s);

  const base = (rest: Partial<PlanMeta>, t: Partial<PlanTimings>): PlanMeta => ({
    source: mock ? 'mock' : parseFellBack || rest.rankFallback ? 'fallback' : 'muse',
    summarySource: 'code',
    mode: mock ? 'mock' : 'live',
    understood: parsed.understood,
    models: { parse: parsed.model, rank: 'none' },
    rankFallback: false,
    rankError: null,
    parseError: parsed.error,
    summaryIssue: null,
    budgetMs,
    candidateCount: 0,
    friendsChecked: ctx.friends.length,
    friendsFree: [],
    prices: {},
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
  const friendsFree = result.friendsFree.map((f) => ({ firstName: f.firstName, freeUntil: f.freeUntil }));

  if (result.candidates.length === 0) {
    const summary = summaryText([], parsed.intent, result.friendsFree.map((f) => f.firstName));
    return {
      plan: { intent: parsed.intent, suggestions: [], summary: label(summary) },
      meta: base({ dropped: result.dropped, friendsFree }, { candidatesMs: t3 - t2, totalMs: Date.now() - t0 }),
    };
  }

  const ranked = await rankAndExplain(parsed.intent, result, {
    viewer: ctx.viewer, now, text: input.text,
    deadline: Math.min(deadline, Date.now() + RANK_BUDGET_MS),
    // parse already failed, so Muse is likely down or slow: do not wait on it a second time
    skipModel: parseFellBack ? `skipped: parse fell back (${parsed.error ?? 'unknown'})` : undefined,
  });
  const t4 = Date.now();
  const claims = { intent: parsed.intent, text: input.text, now };
  const checked = validate(ranked.suggestions, result.candidates, ctx, claims);
  const t5 = Date.now();

  const friendsFreeNames = result.friendsFree.map((f) => f.firstName);
  // a pick the model chose was removed: its summary likely talks about it
  const droppedPick = checked.issues.some((i) => !i.field && !i.issue.startsWith('dropped friend id'));
  const modelSummary = ranked.model === 'heuristic' || mock ? null : ranked.summary;
  const sum = droppedPick && modelSummary !== null
    ? { summary: summaryText(checked.suggestions, parsed.intent, friendsFreeNames), source: 'code' as const, issue: 'validate dropped a pick' }
    : modelSummary === null
      ? { summary: checked.suggestions.length > 0 ? ranked.summary : summaryText([], parsed.intent, friendsFreeNames), source: 'code' as const, issue: null }
      : checkSummary(modelSummary, checked.suggestions, { ...ctx, text: input.text, budgetMax: parsed.intent.budgetMax },
        () => summaryText(checked.suggestions, parsed.intent, friendsFreeNames), { ...claims, candidates: result.candidates });
  return {
    plan: { intent: parsed.intent, suggestions: checked.suggestions, summary: label(sum.summary) },
    meta: base(
      {
        summarySource: sum.source,
        summaryIssue: sum.issue,
        models: { parse: parsed.model, rank: ranked.model },
        rankFallback: ranked.fallback,
        rankError: ranked.error,
        candidateCount: result.candidates.length,
        prices: Object.fromEntries(result.candidates.map((c) => [c.questId, c.quest.priceMax])),
        friendsFree,
        dropped: result.dropped,
        issues: checked.issues,
      },
      { candidatesMs: t3 - t2, rankMs: t4 - t3, validateMs: t5 - t4, totalMs: t5 - t0 },
    ),
  };
}
