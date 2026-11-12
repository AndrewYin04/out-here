// Step 3: rank + explain. The smart model (Spark, effort "minimal") sees short ids (c1, f1)
// and checked facts only, and returns picks; code maps ids back and validate() rejects
// anything not in the candidate list. Mock mode and model failure use the heuristic ranker.
import { z } from 'zod';
import { formatDemoTime, type MuseIntent, type PlanSuggestion } from '../../shared';
import type { CandidateResult, PlanCandidate } from './candidates';
import { isMockMode, museJSON } from './client';
import { firstName, type PlanContext } from './context';
import {
  heuristicSuggestion, priceText, rankHeuristic, summaryText, windowText,
} from './explain';
import { rankPrompt, type RankPromptCandidate } from './prompts/rank';

export const RankOutputZ = z.object({
  summary: z.string(),
  picks: z.array(z.object({
    candidate: z.string(),
    friends: z.array(z.string()),
    reason: z.string(),
    bridge: z.string().nullable(),
    inviteDraft: z.string().nullable(),
  })),
});
export type RankOutput = z.infer<typeof RankOutputZ>;

export const RANK_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    picks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          candidate: { type: 'string' },
          friends: { type: 'array', items: { type: 'string' } },
          reason: { type: 'string' },
          bridge: { type: ['string', 'null'] },
          inviteDraft: { type: ['string', 'null'] },
        },
        required: ['candidate', 'friends', 'reason', 'bridge', 'inviteDraft'],
      },
    },
  },
  required: ['summary', 'picks'],
};

export const MAX_SUGGESTIONS = 3;
/** At most this many candidates go to the model (closest-fit first), to keep the prompt small. */
const MAX_PROMPT_CANDIDATES = 8;

export type RankResult = {
  suggestions: PlanSuggestion[];
  summary: string;
  model: string;
  latencyMs: number;
  /** True when the model failed and the heuristic answered instead. */
  fallback: boolean;
  error: string | null;
};

type IdMaps = {
  candidateByShort: Map<string, PlanCandidate>;
  friendByShort: Map<string, string>;
  shortByFriend: Map<string, string>;
};

function buildIdMaps(candidates: PlanCandidate[]): IdMaps {
  const candidateByShort = new Map<string, PlanCandidate>();
  const friendByShort = new Map<string, string>();
  const shortByFriend = new Map<string, string>();
  candidates.forEach((c, i) => {
    candidateByShort.set(`c${i + 1}`, c);
    for (const f of c.friendOverlap) {
      if (!shortByFriend.has(f.friendId)) {
        const s = `f${shortByFriend.size + 1}`;
        shortByFriend.set(f.friendId, s);
        friendByShort.set(s, f.friendId);
      }
    }
  });
  return { candidateByShort, friendByShort, shortByFriend };
}

function promptCandidates(candidates: PlanCandidate[], maps: IdMaps, now: Date): RankPromptCandidate[] {
  return candidates.map((c, i) => ({
    id: `c${i + 1}`,
    title: c.quest.title,
    venue: c.quest.venueName,
    category: c.quest.category,
    tags: c.quest.tags,
    startsAt: formatDemoTime(c.quest.startsAt),
    startsInMin: Math.round((Date.parse(c.quest.startsAt) - now.getTime()) / 60_000),
    walkMin: c.travelMinutes,
    priceMax: c.quest.priceMax,
    seatsLeft: c.seatsLeft,
    matches: c.matchedActivities,
    youLike: c.viewerInterests,
    friendsWhoCanCome: c.friendOverlap.map((f) => ({
      id: maps.shortByFriend.get(f.friendId)!, name: f.firstName,
      freeUntil: formatDemoTime(f.freeUntil), likes: f.sharedWithQuest,
    })),
    friendsAlreadyGoing: c.friendMembers.map((m) => m.firstName),
  }));
}

/** Heuristic picks in the model's output shape (the mock answer). */
function heuristicOutput(ranked: PlanCandidate[], intent: MuseIntent, maps: IdMaps, friendsFreeNames: string[]): RankOutput {
  const shortOf = new Map([...maps.candidateByShort].map(([s, c]) => [c.questId, s]));
  const suggestions = ranked.slice(0, MAX_SUGGESTIONS).map((c) => heuristicSuggestion(c, intent));
  return {
    summary: summaryText(suggestions, intent, friendsFreeNames),
    picks: suggestions.map((s) => ({
      candidate: shortOf.get(s.questId!)!,
      friends: s.friendIds.map((id) => maps.shortByFriend.get(id)!),
      reason: s.reason,
      bridge: s.bridge,
      inviteDraft: s.inviteDraft,
    })),
  };
}

/** Maps model picks back to real ids. Unknown candidate ids are skipped here; validate() re-checks. */
export function picksToSuggestions(out: RankOutput, maps: IdMaps): PlanSuggestion[] {
  const seen = new Set<string>();
  const result: PlanSuggestion[] = [];
  for (const p of out.picks) {
    const c = maps.candidateByShort.get(p.candidate.trim());
    if (!c || seen.has(c.questId)) continue;
    seen.add(c.questId);
    const friendIds = p.friends.map((f) => maps.friendByShort.get(f.trim())).filter((x): x is string => !!x);
    result.push({
      kind: 'join_quest',
      questId: c.questId,
      friendIds,
      title: c.quest.title,
      emoji: c.quest.emoji,
      reason: p.reason.trim(),
      bridge: p.bridge?.trim() || null,
      startsAt: c.quest.startsAt,
      travelMinutes: c.travelMinutes,
      fitsWindow: true,
      seatsLeft: c.seatsLeft,
      inviteDraft: p.inviteDraft?.trim() || null,
    });
  }
  return result;
}

export async function rankAndExplain(
  intent: MuseIntent,
  result: CandidateResult,
  ctx: Pick<PlanContext, 'viewer' | 'now'> & { text: string; route?: string },
): Promise<RankResult> {
  const started = Date.now();
  const ranked = rankHeuristic(result.candidates, intent, ctx.now);
  const shortlist = ranked.slice(0, MAX_PROMPT_CANDIDATES);
  const maps = buildIdMaps(shortlist);
  const friendsFreeNames = result.friendsFree.map((f) => f.firstName);
  const mock = isMockMode();

  const heuristic = (): RankResult => {
    const out = heuristicOutput(shortlist, intent, maps, friendsFreeNames);
    return {
      suggestions: picksToSuggestions(out, maps), summary: out.summary, model: 'heuristic',
      latencyMs: Date.now() - started, fallback: !mock, error: null,
    };
  };
  if (shortlist.length === 0) {
    const r = heuristic();
    return { ...r, fallback: false, model: mock ? 'mock' : 'none' };
  }

  try {
    const res = await museJSON({
      schemaName: 'plan',
      schema: RankOutputZ,
      jsonSchema: RANK_JSON_SCHEMA,
      messages: rankPrompt({
        userName: firstName(ctx.viewer),
        text: ctx.text,
        windowLabel: `${formatDemoTime(intent.windowStart)} to ${formatDemoTime(intent.windowEnd)} (${windowText(intent)})`,
        budget: intent.budgetMax === null ? 'not stated' : priceText(intent.budgetMax),
        wantsFriends: intent.wantsFriends,
        openToNewPeople: intent.openToNewPeople,
        vibe: intent.vibe,
        candidates: promptCandidates(shortlist, maps, ctx.now),
      }),
      model: 'smart',
      effort: 'minimal',
      mock: () => heuristicOutput(shortlist, intent, maps, friendsFreeNames),
      route: ctx.route ?? 'muse/plan',
      userId: ctx.viewer.id,
    });
    const suggestions = picksToSuggestions(res.data, maps);
    if (suggestions.length === 0) {
      return { ...heuristic(), error: 'model returned no valid candidate ids' };
    }
    return {
      suggestions, summary: res.data.summary.trim(), model: res.model,
      latencyMs: Date.now() - started, fallback: false, error: null,
    };
  } catch (err) {
    return { ...heuristic(), error: String((err as Error)?.message ?? err).slice(0, 200) };
  }
}

