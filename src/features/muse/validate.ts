// Step 4: validation, pure code. Whatever the ranker returned, only suggestions for real,
// fitting candidates survive, every number shown to the user is recomputed from data, and
// model text (reason, bridge, invite, summary) may quote only facts code can back.
import { walkingMinutes, type MuseIntent, type MusePlan, type PlanSuggestion, type Quest } from '../../shared';
import type { PlanCandidate } from './candidates';
import type { PlanContext } from './context';
import { bridgeText, inviteText, reasonText } from './explain';
import { MAX_SUGGESTIONS } from './rank';
import { concreteReason } from './prompts/reason-facts';
import { wallClock, windowMinutes } from './time';

export type ValidateContext = Pick<PlanContext, 'quests' | 'friends' | 'location' | 'viewer' | 'knownPeople'>;

/** What the user asked for; used to check numbers and times quoted in model text. */
export type ClaimContext = { intent: MuseIntent; text: string; now: Date };

export type ValidationIssue = {
  questId: string | null;
  issue: string;
  /** Set when model text on a kept card was replaced; absent when a pick or friend was dropped. */
  field?: 'reason' | 'bridge' | 'inviteDraft';
};

/** Field names from the rank prompt's JSON; model text that echoes one is replaced by code text. */
const LEAKED_FIELD = /\b(priceMax|walkMin|freeUntil|startsInMin|startsAt|seatsLeft|youLike|friendsWhoCanCome|friendsAlreadyGoing)\b/;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** First names from `known` that appear in `text` but are not in `allowed`. */
export function leakedNames(text: string | null, known: { id: string; firstName: string }[], allowed: Set<string>): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const p of known) {
    if (allowed.has(p.id) || p.firstName.length < 2) continue;
    if (new RegExp(`\\b${escapeRe(p.firstName)}\\b`).test(text)) out.push(p.firstName);
  }
  return [...new Set(out)];
}

// ---------- claim checks shared by card text and the summary ----------

/** Tags too generic to mean "the model is talking about a different quest". */
const GENERIC_TAGS = new Set([
  'chill', 'quiet', 'focus', 'walk', 'games', 'outdoors', 'pickup', 'drinks', 'snack', 'cheap eats',
  'live music', 'music', 'food', 'art',
]);

/** Words that may follow "free" when it means "available" ("free till 6"), not "no cost". */
const FREE_AVAILABLE = new Set([
  'till', 'til', 'until', 'after', 'before', 'from', 'at', 'now', 'today', 'tonight', 'this', 'right', 'for',
  'to', 'and', 'too', 'then', 'between', 'around', 'in', 'later', 'all', 'by', 'on', 'soon', 'the', 'so',
]);

/** Everything code knows to be true about the kept quests; model text may quote only these. */
export type ClaimFacts = {
  keptQuests: Quest[];
  /** All quests the viewer can see, to catch mentions of ones not in the plan. */
  quests: Quest[];
  knownPeople: ValidateContext['knownPeople'];
  allowedPeople: Set<string>;
  prices: Set<number>;
  minutes: number[];
  /** Minutes since local midnight (DEMO_TZ). */
  clocks: number[];
  /** Words from kept quests and the user's text: a tag made only of these is not "another quest". */
  keptWords: Set<string>;
  /** False: "you both" and similar claims are not allowed. */
  hasFriend: boolean;
};

const minuteOfDay = (iso: string) => {
  const w = wallClock(new Date(iso));
  return w.hour * 60 + w.minute;
};
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

export function claimFacts(args: {
  kept: { quest: Quest; candidate?: PlanCandidate; friendIds: string[] }[];
  ctx: ValidateContext;
  claims?: ClaimContext;
  budgetMax?: number | null;
  userText?: string;
}): ClaimFacts {
  const { kept, ctx, claims } = args;
  const budget = claims ? claims.intent.budgetMax : args.budgetMax ?? null;
  const userText = claims?.text ?? args.userText ?? '';
  const prices = new Set<number>(kept.map((k) => k.quest.priceMax));
  if (budget !== null) prices.add(budget);
  for (const m of userText.matchAll(/\$\s?(\d+(?:\.\d+)?)/g)) prices.add(Number(m[1]));

  const minutes: number[] = [];
  const clocks: number[] = [];
  const allowedPeople = new Set<string>([ctx.viewer.id]);
  for (const { quest, candidate, friendIds } of kept) {
    for (const id of friendIds) allowedPeople.add(id);
    if (quest.isPublic) for (const id of quest.memberIds) allowedPeople.add(id);
    minutes.push(walkingMinutes(ctx.location, quest.location));
    minutes.push(Math.round((Date.parse(quest.endsAt) - Date.parse(quest.startsAt)) / 60_000));
    if (claims) minutes.push(Math.round((Date.parse(quest.startsAt) - claims.now.getTime()) / 60_000));
    clocks.push(minuteOfDay(quest.startsAt), minuteOfDay(quest.endsAt));
    for (const f of candidate?.friendOverlap ?? []) {
      if (!friendIds.includes(f.friendId)) continue;
      minutes.push(f.travelMinutes);
      clocks.push(minuteOfDay(f.freeFrom), minuteOfDay(f.freeUntil));
    }
  }
  if (claims) {
    const { intent } = claims;
    minutes.push(windowMinutes(intent.windowStart, intent.windowEnd));
    if (intent.maxWalkMinutes !== null) minutes.push(intent.maxWalkMinutes);
    clocks.push(minuteOfDay(intent.windowStart), minuteOfDay(intent.windowEnd));
  }
  for (const m of userText.matchAll(/\d+/g)) minutes.push(Number(m[0]));

  const keptWords = new Set<string>();
  for (const { quest: q } of kept) for (const w of words([q.title, q.venueName, q.category, ...q.tags].join(' '))) keptWords.add(w);
  for (const w of words(userText)) keptWords.add(w);

  return {
    keptQuests: kept.map((k) => k.quest), quests: ctx.quests, knownPeople: ctx.knownPeople, allowedPeople,
    prices, minutes, clocks, keptWords, hasFriend: kept.some((k) => k.friendIds.length > 0),
  };
}

/**
 * Why `text` makes a claim the data does not back, or null when it is fine. Checks names
 * outside the plan, $ amounts, "free" perks on a paid quest, "N min" figures (within 1),
 * clock times, mentions of quests not in the plan, and "you both" with no friend invited.
 * `f.quests` must hold only quests the viewer may see, because issue strings quote them.
 */
export function claimIssue(text: string, f: ClaimFacts, label: string): string | null {
  const names = leakedNames(text, f.knownPeople, f.allowedPeople);
  if (names.length) return `${label} named ${names.join(', ')}`;

  for (const m of text.matchAll(/\$\s?(\d+(?:\.\d+)?)/g)) {
    if (!f.prices.has(Number(m[1]))) return `${label} quoted $${m[1]}`;
  }
  const lower = text.toLowerCase();
  if (f.keptQuests.length > 0 && f.keptQuests.every((q) => q.priceMax > 0)) {
    for (const m of lower.matchAll(/\bfree\s+([a-z]+)/g)) {
      if (!FREE_AVAILABLE.has(m[1])) return `${label} promised free ${m[1]}`;
    }
    if (/\bfor free\b|\bon the house\b|\b(?:it'?s|it is|entry is|admission is)\s+free\b/.test(lower)) {
      return `${label} said it is free`;
    }
  }

  for (const m of lower.matchAll(/\b(\d+)\s*-?\s*(?:min|mins|minute|minutes)\b/g)) {
    const n = Number(m[1]);
    if (!f.minutes.some((x) => Math.abs(x - n) <= 1)) return `${label} quoted ${n} min`;
  }

  for (const m of lower.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m\b/g)) {
    const h = (Number(m[1]) % 12) + (m[3] === 'p' ? 12 : 0);
    if (!f.clocks.includes(h * 60 + Number(m[2] ?? 0))) return `${label} quoted ${m[0].trim()}`;
  }
  for (const m of lower.matchAll(/\b(\d{1,2}):(\d{2})\b(?!\s*[ap]\.?\s?m\b)/g)) {
    const h = Number(m[1]) % 12;
    const mm = Number(m[2]);
    if (!f.clocks.includes(h * 60 + mm) && !f.clocks.includes((h + 12) * 60 + mm)) return `${label} quoted ${m[0]}`;
  }

  const keptIds = new Set(f.keptQuests.map((q) => q.id));
  const has = (phrase: string) => new RegExp(`\\b${escapeRe(phrase.toLowerCase())}\\b`).test(lower);
  for (const q of f.quests) {
    if (keptIds.has(q.id)) continue;
    if (q.venueName && has(q.venueName)) return `${label} mentioned ${q.venueName}, which is not in the plan`;
    if (q.title && has(q.title)) return `${label} mentioned "${q.title}", which is not in the plan`;
    for (const tag of q.tags) {
      const t = tag.toLowerCase();
      if (GENERIC_TAGS.has(t) || words(t).every((w) => f.keptWords.has(w))) continue;
      if (has(t)) return `${label} mentioned ${tag}, which is not in the plan`;
    }
  }

  if (!f.hasFriend && /\byou both\b|\byou two\b|\bboth (?:like|love|enjoy|are into|into)\b|\byour friends?\b/.test(lower)) {
    return `${label} claimed a friend is coming, but none was invited`;
  }
  return null;
}

export function validate(
  suggestions: PlanSuggestion[],
  candidates: PlanCandidate[],
  ctx: ValidateContext,
  claims?: ClaimContext,
): { suggestions: PlanSuggestion[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const byQuest = new Map(candidates.map((c) => [c.questId, c]));
  const questById = new Map(ctx.quests.map((q) => [q.id, q]));
  const friendIds = new Set(ctx.friends.map((f) => f.profile.id));
  const seen = new Set<string>();
  const out: PlanSuggestion[] = [];

  for (const s of suggestions) {
    if (!s.questId || !questById.has(s.questId)) { issues.push({ questId: s.questId, issue: 'unknown quest id' }); continue; }
    const c = byQuest.get(s.questId);
    if (!c) { issues.push({ questId: s.questId, issue: 'quest is not a candidate' }); continue; }
    if (!c.fitsWindow) { issues.push({ questId: s.questId, issue: 'does not fit window' }); continue; }
    if (seen.has(s.questId)) { issues.push({ questId: s.questId, issue: 'duplicate' }); continue; }
    seen.add(s.questId);

    const quest = questById.get(s.questId)!;
    const seatsLeft = quest.capacity - quest.memberIds.length;
    if (seatsLeft <= 0) { issues.push({ questId: s.questId, issue: 'full' }); continue; }

    const overlapIds = new Set(c.friendOverlap.map((f) => f.friendId));
    const keptFriends = [...new Set(s.friendIds)].filter((id) => {
      const ok = friendIds.has(id) && overlapIds.has(id);
      if (!ok) issues.push({ questId: s.questId, issue: `dropped friend id ${id}` });
      return ok;
    });

    // model text may quote only facts about this quest, its invited friends and the request
    const facts = claimFacts({ kept: [{ quest, candidate: c, friendIds: keptFriends }], ctx, claims });
    const checked = (
      field: NonNullable<ValidationIssue['field']>, text: string, fallback: () => string | null,
    ): string | null => {
      // prompt field names ("priceMax 12", "Her freeUntil is…") must never reach users
      const problem = LEAKED_FIELD.test(text) ? 'leaked a data field name' : claimIssue(text, facts, field);
      if (!problem) return text;
      issues.push({ questId: s.questId, issue: problem, field });
      return fallback();
    };
    const modelReason = s.reason?.trim();
    const reason = concreteReason((modelReason && checked('reason', modelReason, () => null)) || reasonText(c, keptFriends), c, { budgetMax: claims?.intent.budgetMax ?? null, windowEnd: claims?.intent.windowEnd ?? null });
    const modelBridge = s.bridge?.trim();
    const bridge = modelBridge ? checked('bridge', modelBridge, () => bridgeText(c, keptFriends)) : null;
    const modelInvite = s.inviteDraft?.trim();
    const inviteDraft = keptFriends.length === 0
      ? null
      : modelInvite ? checked('inviteDraft', modelInvite, () => inviteText(c, keptFriends)) : inviteText(c, keptFriends);

    out.push({
      kind: 'join_quest',
      questId: quest.id,
      friendIds: keptFriends,
      title: quest.title,
      emoji: quest.emoji,
      reason,
      bridge,
      startsAt: quest.startsAt,
      travelMinutes: walkingMinutes(ctx.location, quest.location),
      fitsWindow: true,
      seatsLeft,
      inviteDraft,
    });
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return { suggestions: out, issues };
}

/** A plan with no suggestions (nonsense input, nothing fits). */
export function emptyPlan(intent: MusePlan['intent'], summary: string): MusePlan {
  return { intent, suggestions: [], summary };
}

export type SummaryCheck = { summary: string; source: 'muse' | 'code'; issue: string | null };

/**
 * Checks the model's free-text summary against the kept suggestions with the same claim
 * checks as card text (names, prices, free perks, minutes, clock times, other quests).
 * On a problem, code rebuilds the summary from the kept suggestions.
 */
export function checkSummary(
  summary: string | null,
  kept: PlanSuggestion[],
  ctx: ValidateContext & { text: string; budgetMax: number | null },
  fallbackSummary: () => string,
  claims?: ClaimContext & { candidates?: PlanCandidate[] },
): SummaryCheck {
  const replace = (issue: string): SummaryCheck => ({ summary: fallbackSummary(), source: 'code', issue });
  const text = summary?.trim() ?? '';
  if (!text) return replace('summary empty');
  if (kept.length === 0) return replace('no suggestions kept');

  const questById = new Map(ctx.quests.map((q) => [q.id, q]));
  const candById = new Map((claims?.candidates ?? []).map((c) => [c.questId, c]));
  const rows = kept.flatMap((s) => {
    const quest = questById.get(s.questId ?? '');
    return quest ? [{ quest, candidate: candById.get(quest.id), friendIds: s.friendIds }] : [];
  });
  const facts = claimFacts({ kept: rows, ctx, claims, budgetMax: ctx.budgetMax, userText: ctx.text });
  const problem = claimIssue(text, facts, 'summary');
  return problem ? replace(problem) : { summary: text, source: 'muse', issue: null };
}
