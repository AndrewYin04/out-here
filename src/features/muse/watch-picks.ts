// Muse picks Marketplace items from what someone watches.
//
// 1. Taste (fast model): the videos they watched this week -> up to 4 topics, each with the
//    videos that show it. Code keeps only real video keys and topics with enough watching.
// 2. Candidates (code): listings they could buy, with price, drive time and any linked open house.
// 3. Pick (fast model): only the listings that fit a topic, with a reason. Code drops unknown ids
//    and topics, drops a pick whose words share nothing with its topic's videos (Muse cannot
//    stretch a topic to fit), and replaces a reason that quotes a number the facts don't have.
// 4. Fallback (no Muse, or Muse failed): the same word overlap picks, with code-written reasons.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { drivingMinutes, formatDemoTime, type LatLng } from '@/shared';
import type { MarketplacePick, MarketplacePicksResponse, PersonCard, TasteTopic, WatchHistoryItem, WatchVideo } from '@/shared/api';
import type { Listing } from '@/shared';
import { museJSON, reportFallback } from './client';
import { pickMessages, tasteMessages } from './prompts/watch-picks';

export type PicksInput = {
  history: (WatchHistoryItem & { video: WatchVideo })[];
  interests: string[];
  listings: { listing: Listing; seller: PersonCard; openHouse: MarketplacePick['openHouse'] }[];
  origin: LatLng;
  at: Date;
  /** Topic names the viewer switched off. */
  exclude: string[];
  userId: string | null;
};

/** A topic needs at least this much watching to count, unless it was watched just now. */
export const MIN_TOPIC_SECONDS = 120;
/** A view in the last NEW_WINDOW_MIN this long counts on its own ("you just watched"). */
export const MIN_FRESH_SECONDS = 5;
/** A view this recent makes its picks "New". */
export const NEW_WINDOW_MIN = 15;
export const MAX_TOPICS = 4;
export const MAX_PICKS = 5;

const minutes = (sec: number) => Math.max(1, Math.round(sec / 60));
const money = (n: number) => (n === 0 ? 'free' : `$${Number.isInteger(n) ? n : n.toFixed(2)}`);
export const cleanTitle = (t: string) => t.replace(/\s+[-–]\s+\$\d[\d.,]*\s*$/, '').trim();

// ---------- words ----------
const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'your', 'you', 'this', 'that', 'into', 'out', 'one', 'two', 'three', 'easy',
  'how', 'first', 'full', 'small', 'used', 'good', 'great', 'works', 'set', 'new', 'like', 'just', 'all', 'more',
  'start', 'finish', 'minute', 'minutes', 'local', 'anyone', 'learn', 'pickup', 'selling', 'because', 'near', 'park',
]);
/** Lowercase word stems (3+ letters, trailing s dropped), without filler words. */
export function stems(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().match(/[a-z][a-z0-9]+/g) ?? []) {
    if (w.length < 3 || STOP.has(w)) continue;
    out.add(w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w);
  }
  return out;
}
const overlaps = (a: Set<string>, b: Set<string>) => [...a].some((w) => b.has(w));

// ---------- 1. taste ----------
const RawTasteZ = z.object({
  topics: z.array(z.object({ name: z.string(), why: z.string(), evidence: z.array(z.string()) })).max(8),
});
type RawTaste = z.infer<typeof RawTasteZ>;
const TASTE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['topics'],
  properties: {
    topics: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['name', 'why', 'evidence'],
        properties: { name: { type: 'string' }, why: { type: 'string' }, evidence: { type: 'array', items: { type: 'string' } } },
      },
    },
  },
};

/** Offline taste: videos that share a topic tag form one group, named by its most-watched tag. */
export function mockTaste(history: PicksInput['history']): RawTaste {
  const parent = history.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  history.forEach((a, i) => history.forEach((b, j) => {
    if (j > i && a.video.topics.some((t) => b.video.topics.includes(t))) parent[find(j)] = find(i);
  }));
  const groups = new Map<number, number[]>();
  history.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  return {
    topics: [...groups.values()].map((idx) => {
      const weight = new Map<string, number>();
      for (const i of idx) for (const t of history[i].video.topics) weight.set(t, (weight.get(t) ?? 0) + history[i].seconds);
      const name = [...weight].sort((a, b) => b[1] - a[1])[0][0];
      return { name, why: `You keep coming back to ${name} videos.`, evidence: idx.map((i) => history[i].videoKey) };
    }),
  };
}

const freshSince = (at: Date) => new Date(at.getTime() - NEW_WINDOW_MIN * 60_000).toISOString();

/** Real keys only, enough watching (or watched just now), no duplicate videos across topics, strongest first. */
export function validateTaste(raw: RawTaste, history: PicksInput['history'], at: Date): TasteTopic[] {
  const since = freshSince(at);
  const byKey = new Map(history.map((h) => [h.videoKey, h]));
  const used = new Set<string>();
  const out: TasteTopic[] = [];
  for (const t of raw.topics) {
    const name = t.name.trim().toLowerCase().replace(/[^a-z0-9 &'-]/g, '').slice(0, 30);
    if (!name || out.some((o) => o.name === name)) continue;
    const keys = [...new Set(t.evidence)].filter((k) => byKey.has(k) && !used.has(k));
    const seconds = keys.reduce((s, k) => s + byKey.get(k)!.seconds, 0);
    const fresh = keys.some((k) => byKey.get(k)!.lastAt >= since && byKey.get(k)!.seconds >= MIN_FRESH_SECONDS);
    if (seconds < MIN_TOPIC_SECONDS && !fresh) continue;
    keys.forEach((k) => used.add(k));
    out.push({
      name, why: t.why.trim().slice(0, 160), minutes: minutes(seconds), justNow: fresh,
      evidence: keys.map((k) => ({ video: byKey.get(k)!.video, minutes: minutes(byKey.get(k)!.seconds), seconds: byKey.get(k)!.seconds }))
        .sort((a, b) => b.minutes - a.minutes),
    });
  }
  // Watched just now first (that is the news), then by minutes.
  return out.sort((a, b) => Number(b.justNow) - Number(a.justNow) || b.minutes - a.minutes).slice(0, MAX_TOPICS);
}

// ---------- 2 + 3. picks ----------
const RawPicksZ = z.object({ picks: z.array(z.object({ candidate: z.string(), topic: z.string(), reason: z.string() })).max(10) });
type RawPicks = z.infer<typeof RawPicksZ>;
const PICKS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['picks'],
  properties: {
    picks: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['candidate', 'topic', 'reason'],
        properties: { candidate: { type: 'string' }, topic: { type: 'string' }, reason: { type: 'string' } },
      },
    },
  },
};

type Cand = PicksInput['listings'][number] & { id: string; words: Set<string> };

/** The words a topic stands for: its name and its videos' topic tags (not titles, which mention
 *  incidental things: a "denim jacket" title must not make a rain jacket fit "vintage"). */
function topicWords(t: TasteTopic): Set<string> {
  return stems([t.name, ...t.evidence.flatMap((e) => e.video.topics)].join(' '));
}

/** How well an item fits a topic: 1 per shared word, but only 0.5 for the topic's own name, which
 *  every video in it carries. So for "vintage" (denim Reels), a denim bag beats a jacket that only
 *  says "vintage". */
function fitScore(t: TasteTopic, words: Set<string>, c: Cand): number {
  const name = stems(t.name);
  return [...words].filter((w) => c.words.has(w)).reduce((s, w) => s + (name.has(w) ? 0.5 : 1), 0);
}

/** Offline picks: listings whose words overlap a topic's words, strongest topic first, best fit
 *  first within a topic (ties keep the listing order). */
export function mockPicks(topics: TasteTopic[], cands: Cand[]): RawPicks {
  const picks: RawPicks['picks'] = [];
  for (const t of topics) {
    const w = topicWords(t);
    const ranked = cands.filter((c) => overlaps(c.words, w))
      .map((c, i) => ({ c, i, score: fitScore(t, w, c) }))
      .sort((a, b) => b.score - a.score || a.i - b.i);
    for (const { c } of ranked) if (!picks.some((p) => p.candidate === c.id)) picks.push({ candidate: c.id, topic: t.name, reason: '' });
  }
  return { picks: picks.slice(0, MAX_PICKS) };
}

/** The topic's video closest to this item (most shared words), else its most-watched one. A tie
 *  goes to the one watched furthest through (a Reel watched twice beats a video watched once). */
function closestVideo(t: TasteTopic, c: Cand): TasteTopic['evidence'][number]['video'] | undefined {
  let best = t.evidence[0];
  let score = -1;
  let through = -1;
  for (const e of t.evidence) {
    const w = stems(`${e.video.title} ${e.video.topics.join(' ')}`);
    const n = [...w].filter((x) => c.words.has(x)).length;
    const r = e.seconds / Math.max(60, e.video.minutes * 60);
    if (n > score || (n === score && r > through)) { score = n; through = r; best = e; }
  }
  return best?.video;
}

export function codeReason(t: TasteTopic, c: Cand): string {
  const v = closestVideo(t, c);
  const top = v ? (v.format === 'reel' ? `the Reel "${v.title}"` : `"${v.title}"`) : null;
  const watched = t.justNow && top
    ? `You just watched ${top}.`
    : `You've watched ${t.minutes} min of ${t.name} videos this week${top ? `, like ${top}` : ''}.`;
  const item = c.openHouse
    ? `${c.seller.name.split(' ')[0]} is selling this and holding an open house at ${c.openHouse.venueName} at ${formatDemoTime(c.openHouse.startsAt)}.`
    : `This one is ${money(c.listing.priceUsd)}.`;
  return `${watched} ${item}`;
}

const FIELD_NAMES = /\b(candidate|evidence|priceUsd|minutes:|openHouse|topics?:)\b/;
/** Null when every number and price in the reason is one of the facts. */
export function checkReason(text: string, t: TasteTopic, c: Cand): string | null {
  if (!text.trim() || text.length > 260) return 'empty or too long';
  if (FIELD_NAMES.test(text)) return 'leaked a data field name';
  const prices = new Set([money(c.listing.priceUsd), `$${c.listing.priceUsd}`]);
  for (const m of text.matchAll(/\$\s?\d[\d,]*(?:\.\d+)?/g)) {
    if (!prices.has(m[0].replace(/[\s,]/g, ''))) return `quoted ${m[0]}`;
  }
  const mins = new Set([t.minutes, ...t.evidence.map((e) => e.minutes), ...t.evidence.map((e) => e.video.minutes)]);
  for (const m of text.matchAll(/(\d+)\s?-?\s?(?:min|minute)/gi)) if (!mins.has(Number(m[1]))) return `quoted ${m[0]}`;
  const time = c.openHouse ? formatDemoTime(c.openHouse.startsAt) : null;
  for (const m of text.matchAll(/\b(\d{1,2}(?::\d{2})?)\s?(AM|PM|am|pm)\b/g)) {
    const [h, mm = '00'] = m[1].split(':');
    if (`${h}:${mm} ${m[2].toUpperCase()}` !== time) return `quoted ${m[0]}`;
  }
  return null;
}

// ---------- the pipeline ----------
const cache = new Map<string, MarketplacePicksResponse>();

export async function marketplacePicks(input: PicksInput): Promise<MarketplacePicksResponse> {
  const t0 = Date.now();
  const route = '/api/muse/marketplace-picks';
  const key = createHash('sha256').update(JSON.stringify([
    input.history.map((h) => [h.videoKey, h.seconds]), input.listings.map((l) => [l.listing.id, l.listing.priceUsd]),
    [...input.exclude].sort(), Math.floor(input.at.getTime() / (NEW_WINDOW_MIN * 60_000)),
  ])).digest('hex');
  const hit = cache.get(key);
  if (hit) return { ...hit, ms: Date.now() - t0 };

  let source = 'muse' as MarketplacePicksResponse['source'];
  const degrade = (s: 'mock' | 'fallback') => { if (source === 'muse' || s === 'fallback') source = s; };

  // 1. taste
  let rawTaste: RawTaste;
  if (input.history.length === 0) {
    rawTaste = { topics: [] };
  } else {
    try {
      const res = await museJSON({
        schemaName: 'taste', schema: RawTasteZ, jsonSchema: TASTE_SCHEMA, model: 'fast', effort: 'minimal',
        messages: tasteMessages({
          watched: input.history.map((h) => ({
            key: h.videoKey, title: h.video.title, topics: h.video.topics, minutes: minutes(h.seconds),
            justNow: h.lastAt >= freshSince(input.at),
          })),
          interests: input.interests,
        }),
        mock: () => mockTaste(input.history), route, userId: input.userId, deadline: Date.now() + 8_000,
      });
      rawTaste = res.data;
      if (res.mock) degrade('mock');
    } catch (err) {
      reportFallback({ route, step: 'taste', error: String((err as Error)?.message ?? err).slice(0, 200), userId: input.userId });
      rawTaste = mockTaste(input.history);
      degrade('fallback');
    }
  }
  let topics = validateTaste(rawTaste, input.history, input.at);
  // Muse merged too little or named nothing usable: the offline grouping is always grounded.
  if (topics.length === 0 && input.history.length > 0) topics = validateTaste(mockTaste(input.history), input.history, input.at);
  const excluded = new Set(input.exclude.map((e) => e.toLowerCase()));
  const active = topics.filter((t) => !excluded.has(t.name));

  // 2. candidates
  const cands: Cand[] = input.listings.map((l, i) => ({
    ...l, id: `c${i + 1}`, words: stems(`${cleanTitle(l.listing.title)} ${l.listing.category} ${l.listing.description}`),
  }));
  const byId = new Map(cands.map((c) => [c.id, c]));

  // 3. picks
  let rawPicks: RawPicks = { picks: [] };
  if (active.length > 0 && cands.length > 0) {
    try {
      const res = await museJSON({
        schemaName: 'marketplace_picks', schema: RawPicksZ, jsonSchema: PICKS_SCHEMA, model: 'fast', effort: 'minimal',
        messages: pickMessages({
          topics: active.map((t) => ({ name: t.name, minutes: t.minutes, justWatched: t.justNow, videos: t.evidence.map((e) => ({ title: e.video.title, minutes: e.minutes })) })),
          candidates: cands.map((c) => ({
            id: c.id, title: cleanTitle(c.listing.title), category: c.listing.category, description: c.listing.description.slice(0, 120),
            price: money(c.listing.priceUsd),
            openHouse: c.openHouse ? `${c.openHouse.title} at ${c.openHouse.venueName}, ${formatDemoTime(c.openHouse.startsAt)}` : null,
          })),
        }),
        mock: () => mockPicks(active, cands), route, userId: input.userId, deadline: Date.now() + 12_000,
      });
      rawPicks = res.data;
      if (res.mock) degrade('mock');
    } catch (err) {
      reportFallback({ route, step: 'marketplace_picks', error: String((err as Error)?.message ?? err).slice(0, 200), userId: input.userId });
      rawPicks = mockPicks(active, cands);
      degrade('fallback');
    }
  }

  // 4. validate
  const newSince = freshSince(input.at);
  const picks: MarketplacePick[] = [];
  for (const p of rawPicks.picks) {
    const c = byId.get(p.candidate);
    const t = active.find((x) => x.name === p.topic.trim().toLowerCase());
    if (!c || !t || picks.some((x) => x.listing.id === c.listing.id)) continue;
    if (!overlaps(c.words, topicWords(t))) continue; // the item must share words with what they watched
    const issue = p.reason ? checkReason(p.reason, t, c) : 'no reason';
    if (issue && p.reason) reportFallback({ route, step: 'pick_reason', error: issue, userId: input.userId });
    const evidenceKeys = new Set(t.evidence.map((e) => e.video.key));
    picks.push({
      listing: c.listing, seller: c.seller, topic: t.name,
      reason: issue ? codeReason(t, c) : p.reason.trim(),
      evidence: t.evidence,
      driveMin: c.listing.location ? drivingMinutes(input.origin, c.listing.location) : null,
      openHouse: c.openHouse,
      isNew: input.history.some((h) => evidenceKeys.has(h.videoKey) && h.lastAt >= newSince),
    });
    if (picks.length >= MAX_PICKS) break;
  }
  // A linked open house goes first: it is something to do today, not just something to buy.
  picks.sort((a, b) => Number(!!b.openHouse) - Number(!!a.openHouse));

  const pickedIds = new Set(picks.map((p) => p.listing.id));
  const out: MarketplacePicksResponse = {
    topics, picks,
    hidden: input.listings.filter((l) => !pickedIds.has(l.listing.id)).map(({ listing, seller }) => ({ listing, seller })),
    checked: input.listings.length, videosRead: input.history.length, source, ms: Date.now() - t0,
  };
  if (cache.size > 100) cache.clear();
  if (source !== 'fallback') cache.set(key, out);
  return out;
}
