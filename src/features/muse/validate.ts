// Step 4: validation, pure code. Whatever the ranker returned, only suggestions for real,
// fitting candidates survive, and every number shown to the user is recomputed from data.
import { walkingMinutes, type MusePlan, type PlanSuggestion } from '../../shared';
import type { PlanCandidate } from './candidates';
import type { PlanContext } from './context';
import { bridgeText, inviteText, reasonText } from './explain';
import { MAX_SUGGESTIONS } from './rank';

export type ValidateContext = Pick<PlanContext, 'quests' | 'friends' | 'location' | 'viewer' | 'knownPeople'>;

export type ValidationIssue = { questId: string | null; issue: string };

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

export function validate(
  suggestions: PlanSuggestion[],
  candidates: PlanCandidate[],
  ctx: ValidateContext,
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

    // names the text may use: the viewer, invited friends, and people already in this public quest
    const allowed = new Set<string>([ctx.viewer.id, ...keptFriends, ...(quest.isPublic ? quest.memberIds : [])]);
    let reason = s.reason?.trim() ?? '';
    if (!reason || leakedNames(reason, ctx.knownPeople, allowed).length > 0) {
      if (reason) issues.push({ questId: s.questId, issue: 'reason named someone not in the plan' });
      reason = reasonText(c, keptFriends);
    }
    let bridge = s.bridge?.trim() || null;
    if (bridge && leakedNames(bridge, ctx.knownPeople, allowed).length > 0) {
      issues.push({ questId: s.questId, issue: 'bridge named someone not in the plan' });
      bridge = bridgeText(c, keptFriends);
    }
    let inviteDraft = keptFriends.length > 0 ? s.inviteDraft?.trim() || null : null;
    if (keptFriends.length > 0 && (!inviteDraft || leakedNames(inviteDraft, ctx.knownPeople, allowed).length > 0)) {
      inviteDraft = inviteText(c, keptFriends);
    }

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

/** Tags too generic to mean "the model is talking about a different quest". */
const GENERIC_TAGS = new Set([
  'chill', 'quiet', 'focus', 'walk', 'games', 'outdoors', 'pickup', 'drinks', 'snack', 'cheap eats',
  'live music', 'music', 'food', 'art',
]);

export type SummaryCheck = { summary: string; source: 'muse' | 'code'; issue: string | null };

/**
 * Checks the model's free-text summary against the kept suggestions. The summary is kept
 * only when it names no one outside the plan, quotes no price other than a kept quest's
 * price or the user's budget, and mentions no venue, title or distinctive tag of a quest
 * that is not in the plan. Otherwise code rebuilds it from the kept suggestions.
 */
export function checkSummary(
  summary: string | null,
  kept: PlanSuggestion[],
  ctx: ValidateContext & { text: string; budgetMax: number | null },
  fallbackSummary: () => string,
): SummaryCheck {
  const replace = (issue: string): SummaryCheck => ({ summary: fallbackSummary(), source: 'code', issue });
  const text = summary?.trim() ?? '';
  if (!text) return replace('summary empty');
  if (kept.length === 0) return replace('no suggestions kept');

  const questById = new Map(ctx.quests.map((q) => [q.id, q]));
  const keptQuests = kept.map((s) => questById.get(s.questId ?? '')).filter((q): q is NonNullable<typeof q> => !!q);
  const allowed = new Set<string>([ctx.viewer.id]);
  for (const s of kept) for (const id of s.friendIds) allowed.add(id);
  for (const q of keptQuests) if (q.isPublic) for (const id of q.memberIds) allowed.add(id);
  const names = leakedNames(text, ctx.knownPeople, allowed);
  if (names.length) return replace(`summary named ${names.join(', ')}`);

  const prices = new Set<number>(keptQuests.map((q) => q.priceMax));
  if (ctx.budgetMax !== null) prices.add(ctx.budgetMax);
  for (const m of text.matchAll(/\$\s?(\d+(?:\.\d+)?)/g)) {
    if (!prices.has(Number(m[1]))) return replace(`summary quoted $${m[1]}`);
  }

  const lower = text.toLowerCase();
  const keptWords = new Set<string>();
  for (const q of keptQuests) {
    for (const w of [q.title, q.venueName, q.category, ...q.tags].join(' ').toLowerCase().split(/[^a-z0-9]+/)) if (w) keptWords.add(w);
  }
  for (const w of ctx.text.toLowerCase().split(/[^a-z0-9]+/)) if (w) keptWords.add(w);
  const keptIds = new Set(keptQuests.map((q) => q.id));
  const has = (phrase: string) => new RegExp(`\\b${escapeRe(phrase.toLowerCase())}\\b`).test(lower);
  for (const q of ctx.quests) {
    if (keptIds.has(q.id)) continue;
    if (q.venueName && has(q.venueName)) return replace(`summary mentioned ${q.venueName}, which is not in the plan`);
    if (q.title && has(q.title)) return replace(`summary mentioned "${q.title}", which is not in the plan`);
    for (const tag of q.tags) {
      const t = tag.toLowerCase();
      if (GENERIC_TAGS.has(t) || t.split(/[^a-z0-9]+/).every((w) => keptWords.has(w))) continue;
      if (has(t)) return replace(`summary mentioned ${tag}, which is not in the plan`);
    }
  }
  return { summary: text, source: 'muse', issue: null };
}
