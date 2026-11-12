// Muse filter: when the map is crowded, Muse keeps only the plans (Explore) or friends (Friends)
// that match what the viewer is looking for. Server-only. Candidates come from code; Muse only
// picks ids from the list, and code drops any id it did not send. On a Muse error or timeout a
// code ranking (interest and tag overlap, time fit) answers instead, marked source "fallback".
import { z } from 'zod';
import { walkingMinutes, type ID } from '@/shared';
import { firstName, isMockMode, museJSON, reportFallback } from '@/features/muse';
import type { StorePlanContext } from './plan-context';

export type FilterMode = 'explore' | 'friends';
export type FilterKeep = { id: ID; kind: 'quest' | 'friend'; reason: string };
export type FilterResult = {
  keep: FilterKeep[];
  summary: string;
  source: 'muse' | 'fallback';
  /** How many candidates Muse chose from. */
  total: number;
  /** "mock" when MUSE_MOCK or no key: the deterministic stand-in answered. */
  mode: 'live' | 'mock';
  /**
   * True when nothing matched, so code kept the closest few plans (or friends) instead of an
   * empty map. The reasons are then plain facts (start time, walk), not Muse's picks.
   */
  closest: boolean;
};

/** Quests starting later than this are not filter candidates (the band pregame starts at +240). */
export const FILTER_WINDOW_MIN = 240;
export const FILTER_MAX_WALK_MIN = 25;
export const FILTER_MAX_KEEP = 8;
export const FILTER_TIMEOUT_MS = 6_000;
export const FILTER_CACHE_MS = 120_000;
/** With no ask and this many candidates or fewer there is no crowd to cut: every one stays. */
export const FILTER_SMALL_SET = 5;
/** When nothing matches, the closest this many stay on the map. */
export const FILTER_CLOSEST = 3;
/** No candidate in the normal window: look this far (walk) and this late (start) for the closest plans. */
export const FILTER_WIDE_WALK_MIN = 45;
export const FILTER_WIDE_WINDOW_MIN = 12 * 60;

export type QuestCandidate = {
  id: ID; title: string; emoji: string; category: string; venueName: string; tags: string[];
  priceMax: number; startsInMin: number; walkMinutes: number; seatsLeft: number;
};
export type FriendCandidate = {
  id: ID; firstName: string; sharedInterests: string[]; bubble: string | null;
  availabilityText: string | null; freeFromMin: number | null; freeUntilMin: number | null;
};

// ---------- text parsing ----------

const FOOD_WORDS = /\b(hungry|starving|eat|eats|food|snack|snacks|lunch|dinner|brunch|bite|craving)\b/i;
const FOOD_TAGS = new Set(['dumplings', 'cheap eats', 'ramen', 'noodles', 'sushi', 'japanese', 'boba', 'drinks', 'snack', 'pho', 'vietnamese', 'tacos', 'k-food', 'food']);
const STOP = new Set(['want', 'with', 'something', 'someone', 'anything', 'under', 'about', 'like', 'free', 'minutes', 'hours', 'hour', 'mins', 'got', 'for', 'the', 'and', 'now', 'today', 'tonight', 'later', 'maybe', 'down', 'just']);

export type FilterText = { windowMin: number | null; budget: number | null; food: boolean; terms: string[] };

export function parseFilterText(text: string): FilterText {
  const t = text.toLowerCase();
  let windowMin: number | null = null;
  const m = t.match(/(\d+)\s*(?:m|min|mins|minutes)\b/);
  const h = t.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
  if (m) windowMin = Number(m[1]);
  else if (h) windowMin = Math.round(Number(h[1]) * 60);
  const b = t.match(/\$\s*(\d+)/) ?? t.match(/under\s+(\d+)/);
  const budget = b ? Number(b[1]) : null;
  const food = FOOD_WORDS.test(t);
  const terms = t
    .replace(/\$?\d+(\.\d+)?\s*(m|min|mins|minutes|h|hr|hrs|hour|hours)?\b/g, ' ')
    .split(/[^a-z-]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w) && !FOOD_WORDS.test(w));
  return { windowMin, budget, food, terms };
}

const norm = (s: string) => s.toLowerCase().trim();
/** Whole-phrase match in either direction ("local bands" ~ "local bands", "boba" in "down for boba"). */
function phraseIn(phrase: string, text: string): boolean {
  const p = norm(phrase);
  if (p.length < 3) return false;
  const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z])${esc}([^a-z]|$)`).test(norm(text));
}
const sameish = (a: string, b: string) => norm(a) === norm(b) || phraseIn(a, b) || phraseIn(b, a);

// ---------- candidates ----------

export function questCandidates(ctx: StorePlanContext, windowMin = FILTER_WINDOW_MIN, maxWalk = FILTER_MAX_WALK_MIN): QuestCandidate[] {
  const now = ctx.now.getTime();
  const out: QuestCandidate[] = [];
  for (const q of ctx.quests) {
    if (q.status !== 'open') continue;
    if (q.memberIds.includes(ctx.viewer.id)) continue; // the viewer's own plans always stay on the map
    const seatsLeft = q.capacity - q.memberIds.length;
    if (seatsLeft <= 0) continue;
    if (Date.parse(q.endsAt) <= now) continue;
    const startsInMin = Math.round((Date.parse(q.startsAt) - now) / 60_000);
    if (startsInMin > windowMin) continue;
    const walk = walkingMinutes(ctx.location, q.location);
    if (walk > maxWalk) continue;
    out.push({
      id: q.id, title: q.title, emoji: q.emoji, category: q.category, venueName: q.venueName, tags: q.tags,
      priceMax: q.priceMax, startsInMin, walkMinutes: walk, seatsLeft,
    });
  }
  return out;
}

export function friendCandidates(ctx: StorePlanContext): FriendCandidate[] {
  const now = ctx.now.getTime();
  const statusBy = new Map(ctx.friendStatuses.map((s) => [s.friendId, s.line]));
  const out: FriendCandidate[] = [];
  for (const f of ctx.friends) {
    const id = f.profile.id;
    const avail = ctx.friendAvailability
      .filter((a) => a.userId === id && Date.parse(a.endsAt) > now)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    const bubble = statusBy.get(id) ?? f.status ?? null;
    if (!avail && !bubble) continue;
    out.push({
      id, firstName: firstName(f.profile), sharedInterests: f.sharedInterests, bubble,
      availabilityText: avail?.text ?? null,
      freeFromMin: avail ? Math.max(0, Math.round((Date.parse(avail.startsAt) - now) / 60_000)) : null,
      freeUntilMin: avail ? Math.round((Date.parse(avail.endsAt) - now) / 60_000) : null,
    });
  }
  return out;
}

// ---------- heuristic scoring (mock and fallback) ----------

type Scored = { id: ID; score: number; strong: boolean; reason: string };
const STRONG_SCORE = 3;

const isFoodQuest = (q: QuestCandidate) => q.category === 'food' || q.tags.some((t) => FOOD_TAGS.has(norm(t)));
const startsLabel = (min: number) => (min <= 0 ? 'happening now' : min < 60 ? `starts in ${min} min` : `starts in ${Math.round(min / 6) / 10} h`);

export function scoreQuests(ctx: StorePlanContext, cands: QuestCandidate[], text: string): Scored[] {
  const ft = parseFilterText(text);
  const hasText = text.trim().length > 0;
  const budget = ft.budget ?? ctx.viewer.budgetMax;
  const friendTexts = friendCandidates(ctx).flatMap((f) =>
    [f.bubble, f.availabilityText].filter((x): x is string => !!x).map((t) => ({ name: f.firstName, text: t })));
  const out: Scored[] = [];
  for (const q of cands) {
    if (ft.windowMin !== null && (q.startsInMin > ft.windowMin || q.walkMinutes > ft.windowMin)) continue;
    if (q.priceMax > budget) continue;
    const interest = ctx.viewer.interests.find((i) => q.tags.some((t) => sameish(i, t)) || phraseIn(i, q.title));
    let friendHit: { name: string; tag: string } | null = null;
    for (const f of friendTexts) {
      const tag = q.tags.find((t) => phraseIn(t, f.text));
      if (tag) { friendHit = { name: f.name, tag }; break; }
    }
    // A broad interest like "trying new food" counts a little toward any food plan.
    const foodInterest = isFoodQuest(q) ? ctx.viewer.interests.find((i) => /\b(food|eat|eats|eating)\b/i.test(i)) : undefined;
    const termHit = ft.terms.find((w) => q.tags.some((t) => sameish(w, t)) || phraseIn(w, q.title) || w === q.category);
    const foodHit = ft.food && isFoodQuest(q);
    const textHit = !!termHit || foodHit;
    const facts: string[] = [];
    if (termHit) facts.push(`matches "${termHit}"`);
    else if (foodHit) facts.push(`food, $${q.priceMax}`);
    if (interest) facts.push(`matches your interest in ${interest}`);
    if (friendHit && facts.length < 2) facts.push(`${friendHit.name} mentioned ${friendHit.tag}`);
    if (foodInterest && !interest && facts.length < 2) facts.push(`you like ${foodInterest}`);
    facts.push(`${q.walkMinutes} min walk`);
    const soon = Math.max(0, 1 - Math.max(0, q.startsInMin) / FILTER_WINDOW_MIN);
    const score = (textHit ? 4 : 0) + (interest ? 3 : 0) + (friendHit ? 2 : 0) + (foodInterest ? 1 : 0) + soon - q.walkMinutes / 50;
    // No text: a strong match needs a shared interest, or several weaker signals adding up to 3.
    const strong = hasText ? textHit : !!interest || score >= STRONG_SCORE;
    if (facts.length === 1) facts.unshift(startsLabel(q.startsInMin));
    out.push({ id: q.id, score, strong, reason: facts.join(' · ') });
  }
  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export function scoreFriends(ctx: StorePlanContext, cands: FriendCandidate[], text: string): Scored[] {
  const ft = parseFilterText(text);
  const hasText = text.trim().length > 0;
  const out: Scored[] = [];
  for (const f of cands) {
    const blob = [f.bubble, f.availabilityText].filter(Boolean).join(' · ');
    const freeNow = f.freeFromMin !== null && f.freeFromMin <= (ft.windowMin ?? 30);
    const termHit = ft.terms.find((w) => phraseIn(w, blob) || f.sharedInterests.some((i) => sameish(w, i)));
    const foodHit = ft.food && FOOD_WORDS.test(blob);
    const textHit = !!termHit || foodHit;
    const facts: string[] = [];
    if (termHit) facts.push(`said "${blob.slice(0, 40)}"`);
    else if (foodHit) facts.push(`said "${blob.slice(0, 40)}"`);
    if (f.sharedInterests.length) facts.push(`you both like ${f.sharedInterests.slice(0, 2).join(' and ')}`);
    if (f.freeUntilMin !== null && freeNow) facts.push(`free for the next ${f.freeUntilMin} min`);
    else if (f.bubble && !textHit) facts.push(f.bubble.slice(0, 50));
    const score = (textHit ? 4 : 0) + f.sharedInterests.length * 2 + (freeNow ? 1.5 : 0) + (f.bubble ? 0.5 : 0);
    const strong = hasText ? textHit || (freeNow && f.sharedInterests.length >= 2) : f.sharedInterests.length >= 2;
    out.push({ id: f.id, score, strong, reason: `${f.firstName}: ${facts.join(' · ') || 'shared their status'}` });
  }
  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

// ---------- the Muse call ----------

const MuseFilterZ = z.object({
  keep: z.array(z.object({ id: z.string().min(1).max(80), reason: z.string().max(200) })).max(12),
  summary: z.string().max(240),
});
type MuseFilterOut = z.infer<typeof MuseFilterZ>;

const MUSE_FILTER_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['keep', 'summary'],
  properties: {
    keep: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'reason'],
        properties: { id: { type: 'string' }, reason: { type: 'string' } },
      },
    },
    summary: { type: 'string' },
  },
};

function filterMessages(ctx: StorePlanContext, mode: FilterMode, text: string, quests: QuestCandidate[], friends: FriendCandidate[]) {
  const viewer = { interests: ctx.viewer.interests, budgetMax: ctx.viewer.budgetMax };
  const items = mode === 'explore'
    ? quests.map((q) => ({ id: q.id, title: q.title, tags: q.tags, price: q.priceMax, startsInMin: q.startsInMin, walkMin: q.walkMinutes, seatsLeft: q.seatsLeft }))
    : friends.map((f) => ({ id: f.id, name: f.firstName, sharedInterests: f.sharedInterests, bubble: f.bubble, said: f.availabilityText, freeUntilMin: f.freeUntilMin }));
  return [
    {
      role: 'system' as const,
      content:
        'You are Muse inside Facebook Out Here. The map is crowded; keep only what matches what the user is looking for. ' +
        `Pick at most ${FILTER_MAX_KEEP} ids, only from the list. For each, write one short reason (under 90 characters) that cites a concrete fact from the list ` +
        '(a shared interest, a tag, the price, the walk minutes, the start time, or what a friend said). Never invent facts. ' +
        'If the user gave a time ("15 min"), drop items that start or take longer than that to walk to. If they gave a budget, drop items over it. ' +
        'summary: one sentence saying what you kept and why. Reply as JSON.',
    },
    {
      role: 'user' as const,
      content: JSON.stringify({ mode, lookingFor: text || null, me: viewer, items }),
    },
  ];
}

function heuristicKeep(scored: Scored[], strongOnly: boolean): Scored[] {
  const list = strongOnly ? scored.filter((s) => s.strong) : scored.filter((s) => s.score > 0);
  return (list.length ? list : scored).slice(0, FILTER_MAX_KEEP);
}

function summaryFor(mode: FilterMode, kept: number, total: number, text: string): string {
  const what = mode === 'explore' ? 'plans' : 'friends';
  if (!kept) {
    if (mode === 'friends' && !total) return 'No friends are sharing a status or free time right now.';
    return `Nothing nearby matches${text ? ` "${text}"` : ' your interests'} right now.`;
  }
  return `Kept ${kept} of ${total} ${what}${text ? ` for "${text}"` : ' that match your interests'}.`;
}

/** Keeps only ids present in the candidate list (first reason wins), at most FILTER_MAX_KEEP. */
export function validateKeep(raw: { id: string; reason: string }[], allowed: Map<ID, string>, kind: FilterKeep['kind']): FilterKeep[] {
  const seen = new Set<ID>();
  const out: FilterKeep[] = [];
  for (const k of raw) {
    if (!allowed.has(k.id) || seen.has(k.id)) continue;
    seen.add(k.id);
    const reason = k.reason.trim().replace(/\s+/g, ' ').slice(0, 140) || allowed.get(k.id)!;
    out.push({ id: k.id, kind, reason });
    if (out.length >= FILTER_MAX_KEEP) break;
  }
  return out;
}

export type FilterInput = { ctx: StorePlanContext; mode: FilterMode; text: string };

const questFact = (q: QuestCandidate) => `${startsLabel(q.startsInMin)} · ${q.walkMinutes} min walk`;

/**
 * Nothing matched: the closest FILTER_CLOSEST plans by walk (then start), or the best-scored
 * friends, so the filter never empties a map that has something on it.
 */
export function closestKeep(mode: FilterMode, quests: QuestCandidate[], friends: FriendCandidate[], scored: Scored[]): FilterKeep[] {
  if (mode === 'explore') {
    return [...quests]
      .sort((a, b) => a.walkMinutes - b.walkMinutes || a.startsInMin - b.startsInMin || a.id.localeCompare(b.id))
      .slice(0, FILTER_CLOSEST)
      .map((q) => ({ id: q.id, kind: 'quest' as const, reason: questFact(q) }));
  }
  const byId = new Set(friends.map((f) => f.id));
  return scored.filter((s) => byId.has(s.id)).slice(0, FILTER_CLOSEST).map((s) => ({ id: s.id, kind: 'friend' as const, reason: s.reason }));
}

function closestResult(mode: FilterMode, keep: FilterKeep[], total: number, text: string, live: boolean): FilterResult {
  const near = mode === 'explore' ? `here are the ${keep.length} closest plans` : `here are ${keep.length} friends sharing right now`;
  return {
    keep,
    summary: `Nothing matches${text ? ` "${text}"` : ' your interests'} right now, so ${near}.`,
    source: 'muse', total, mode: live ? 'live' : 'mock', closest: true,
  };
}

/** Never return an empty keep while there are candidates. */
function ensureKept(out: FilterResult, quests: QuestCandidate[], friends: FriendCandidate[], scored: Scored[], mode: FilterMode, text: string): FilterResult {
  if (out.keep.length > 0 || out.total === 0) return out;
  const keep = closestKeep(mode, quests, friends, scored);
  return keep.length ? { ...closestResult(mode, keep, out.total, text, out.mode === 'live'), source: out.source } : out;
}

export async function runMuseFilter({ ctx, mode, text }: FilterInput): Promise<FilterResult> {
  const quests = mode === 'explore' ? questCandidates(ctx) : [];
  const friends = mode === 'friends' ? friendCandidates(ctx) : [];
  const scored = mode === 'explore' ? scoreQuests(ctx, quests, text) : scoreFriends(ctx, friends, text);
  const kind: FilterKeep['kind'] = mode === 'explore' ? 'quest' : 'friend';
  const total = mode === 'explore' ? quests.length : friends.length;
  const allowed = new Map<ID, string>(
    mode === 'explore'
      ? quests.map((q) => [q.id, scored.find((s) => s.id === q.id)?.reason || questFact(q)])
      : friends.map((f) => [f.id, scored.find((s) => s.id === f.id)?.reason ?? '']),
  );
  const mock = isMockMode();
  const hasText = text.trim().length > 0;
  if (!total) {
    // Nothing in the normal window: widen the walk and start limits and show the closest plans.
    const wide = mode === 'explore' ? questCandidates(ctx, FILTER_WIDE_WINDOW_MIN, FILTER_WIDE_WALK_MIN) : [];
    const keep = closestKeep(mode, wide, [], []);
    if (keep.length) return closestResult(mode, keep, 0, text, !mock);
    return { keep: [], summary: summaryFor(mode, 0, 0, text), source: 'muse', total: 0, mode: mock ? 'mock' : 'live', closest: false };
  }
  if (!hasText && total <= FILTER_SMALL_SET) {
    // A short list is not the crowd the filter is for: keep every candidate, best match first.
    const rank = new Map(scored.map((s, i) => [s.id, i]));
    const ids = [...allowed.keys()].sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9));
    const what = mode === 'explore' ? 'plans' : 'friends';
    return {
      keep: ids.map((id) => ({ id, kind, reason: allowed.get(id) || 'nearby' })),
      summary: `Only ${total} ${what} nearby right now, so all of them stay.`,
      source: 'muse', total, mode: mock ? 'mock' : 'live', closest: false,
    };
  }

  try {
    const res = await museJSON<MuseFilterOut>({
      schemaName: 'muse_filter',
      schema: MuseFilterZ,
      jsonSchema: MUSE_FILTER_JSON_SCHEMA,
      messages: filterMessages(ctx, mode, text, quests, friends),
      model: 'fast',
      effort: 'minimal',
      route: 'muse/filter',
      userId: ctx.viewer.id,
      timeoutMs: FILTER_TIMEOUT_MS,
      deadline: Date.now() + FILTER_TIMEOUT_MS,
      mock: () => {
        const kept = heuristicKeep(scored, true).filter((s) => s.strong);
        return { keep: kept.map((s) => ({ id: s.id, reason: s.reason })), summary: `[mock] ${summaryFor(mode, kept.length, total, text)}` };
      },
    });
    const keep = validateKeep(res.data.keep, allowed, kind);
    const out: FilterResult = { keep, summary: res.data.summary.trim() || summaryFor(mode, keep.length, total, text), source: 'muse', total, mode: res.mock ? 'mock' : 'live', closest: false };
    return ensureKept(out, quests, friends, scored, mode, text);
  } catch (err) {
    reportFallback({ route: 'muse/filter', step: 'filter', error: String((err as Error)?.message ?? err), userId: ctx.viewer.id });
    return ensureKept(fallbackFilter(scored, kind, mode, total, text), quests, friends, scored, mode, text);
  }
}

/** Code answer: top FILTER_MAX_KEEP by interest/tag overlap and time fit. */
export function fallbackFilter(scored: Scored[], kind: FilterKeep['kind'], mode: FilterMode, total: number, text: string): FilterResult {
  const kept = heuristicKeep(scored, false);
  return {
    keep: kept.map((s) => ({ id: s.id, kind, reason: s.reason })),
    summary: summaryFor(mode, kept.length, total, text),
    source: 'fallback', total, mode: 'live', closest: false,
  };
}

// ---------- 120 s cache ----------

const cache = new Map<string, { at: number; value: FilterResult }>();

export function filterCacheKey(viewerId: ID, mode: FilterMode, text: string): string {
  return `${viewerId}|${mode}|${text.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

export async function cachedMuseFilter(input: FilterInput, nowMs = Date.now()): Promise<FilterResult & { cached: boolean }> {
  const key = filterCacheKey(input.ctx.viewer.id, input.mode, input.text);
  const hit = cache.get(key);
  if (hit && nowMs - hit.at < FILTER_CACHE_MS) return { ...hit.value, cached: true };
  const value = await runMuseFilter(input);
  // A fallback is not cached, so the next toggle tries Muse again.
  if (value.source === 'muse') cache.set(key, { at: nowMs, value });
  if (cache.size > 500) for (const [k, v] of cache) if (nowMs - v.at >= FILTER_CACHE_MS) cache.delete(k);
  return { ...value, cached: false };
}

export function clearFilterCache(): void {
  cache.clear();
}
