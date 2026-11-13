// Muse one-line plan draft (POST /api/muse/create-quest). The model proposes; code decides:
// the place must be one of the real places near the pin, times are resolved from what the
// user said, and every number is clamped. Mock mode uses the same validator.
import { z } from 'zod';
import { haversineMeters, walkingMinutes, type LatLng, type QuestCategory } from '../../shared';
import type { MuseQuestDraft } from '../../shared/api';
import { createQuestMessages } from './prompts/create-quest';
import { localLabel, nextClock, parseClock } from './time';
import { normalizeText } from './cache-key';
import type { MuseMessage } from './client';

export const QUEST_CATEGORIES: readonly QuestCategory[] = ['food', 'music', 'sports', 'study', 'thrift', 'art', 'outdoors', 'games', 'other'];

export type DraftPlace = {
  placeId: string; name: string; category: string; typicalCostUsd: number; location: LatLng; walkMin: number;
};
export type CreateQuestContext = {
  text: string;
  now: Date;
  /** Where the host dropped the pin. */
  pin: LatLng;
  hostFirstName: string;
  hostInterests: string[];
  places: DraftPlace[];
};

const nullableInt = z.number().int().nullable().catch(null);
export const RawDraftZ = z.object({
  title: z.string().trim().min(1).max(120),
  emoji: z.string().trim().min(1).max(16).catch('✨'),
  category: z.string().trim().catch('other'),
  description: z.string().trim().max(400).catch(''),
  placeId: z.string().nullable().catch(null),
  startClock: z.string().nullable().catch(null),
  startsInMinutes: nullableInt,
  durationMinutes: nullableInt,
  capacity: nullableInt,
  priceMax: z.number().nullable().catch(null),
  tags: z.array(z.string()).max(8).catch([]),
  bubbleText: z.string().trim().max(200).nullable().catch(null),
  pitch: z.string().trim().max(400).catch(''),
});
export type RawDraft = z.output<typeof RawDraftZ>;

const nullable = (type: string) => ({ type: [type, 'null'] });
export const RAW_DRAFT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'emoji', 'category', 'description', 'placeId', 'startClock', 'startsInMinutes', 'durationMinutes',
    'capacity', 'priceMax', 'tags', 'bubbleText', 'pitch'],
  properties: {
    title: { type: 'string' }, emoji: { type: 'string' },
    category: { type: 'string', enum: [...QUEST_CATEGORIES] },
    description: { type: 'string' }, placeId: nullable('string'), startClock: nullable('string'),
    startsInMinutes: nullable('integer'), durationMinutes: nullable('integer'), capacity: nullable('integer'),
    priceMax: nullable('number'), tags: { type: 'array', items: { type: 'string' } },
    bubbleText: nullable('string'), pitch: { type: 'string' },
  },
};

/** Up to 8 real places within `radiusM` of the pin, nearest first. */
export function nearbyPlaces(
  places: { id: string; name: string; category: string; typicalCostUsd: number; location: LatLng | null }[],
  pin: LatLng, radiusM = 400, limit = 8,
): DraftPlace[] {
  return places.flatMap((p) => {
    if (!p.location) return [];
    const m = haversineMeters(pin, p.location);
    return m <= radiusM
      ? [{ placeId: p.id, name: p.name, category: p.category, typicalCostUsd: p.typicalCostUsd, location: p.location, walkMin: walkingMinutes(pin, p.location), m }]
      : [];
  }).sort((a, b) => a.m - b.m).slice(0, limit).map(({ m: _m, ...p }) => { void _m; return p; });
}

export function draftMessages(ctx: CreateQuestContext): MuseMessage[] {
  return createQuestMessages({
    text: ctx.text, nowLabel: localLabel(ctx.now), hostFirstName: ctx.hostFirstName, hostInterests: ctx.hostInterests,
    places: ctx.places.map((p) => ({
      placeId: p.placeId, name: p.name, category: p.category,
      typicalCost: p.typicalCostUsd > 0 ? `$${p.typicalCostUsd}` : 'free', walk: `${p.walkMin} min walk from the pin`,
    })),
    categories: QUEST_CATEGORIES,
  });
}

// Words that are prompt plumbing, never user copy.
const FIELD_WORDS = /\b(placeId|startClock|startsInMinutes|durationMinutes|bubbleText|priceMax|walkMin|typicalCost|JSON)\b/g;
const clean = (s: string) => s.replace(FIELD_WORDS, '').replace(/\s{2,}/g, ' ').trim();
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
/** First user-visible character, so ZWJ emoji (👩‍💻) and flags stay whole. */
function firstGrapheme(s: string): string {
  if (!s) return '';
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: 'grapheme' }) => { segment: (t: string) => Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) for (const g of new Seg('en', { granularity: 'grapheme' }).segment(s)) return g.segment;
  return [...s][0] ?? '';
}
const roundTo5 = (ms: number) => Math.ceil(ms / (5 * 60_000)) * 5 * 60_000;

/**
 * Muse cache key for a draft: persona and prompt template are added by museCacheKey; this adds
 * the normalized sentence and the ORDERED ids of the places Muse chose from, so a pin with a
 * different set of nearby places misses the cache and goes live.
 */
export function draftCacheKey(ctx: Pick<CreateQuestContext, 'text' | 'places'>): { text: string; places: string[] } {
  return { text: normalizeText(ctx.text), places: ctx.places.map((p) => p.placeId) };
}

// "9 min walk", "2 min from your pin", "3 minutes away": walk claims, not start times.
const WALK_MIN_RE = /(\d+)\s*-?\s*min(?:ute)?s?\s+(?:walk|away|from)\b/gi;

/**
 * The model's pitch, unless it no longer fits the checked place: its place id is not near this
 * pin, it names a different nearby place, or its walk minutes differ. Then the code pitch.
 */
function checkedPitch(raw: RawDraft, place: DraftPlace | null, ctx: CreateQuestContext): string {
  const code = place ? `I picked ${place.name}, ${place.walkMin} min from your pin.` : 'I kept your pin as the spot.';
  const pitch = clean(raw.pitch);
  if (!pitch) return code;
  if (raw.placeId && !place) return code;
  const lower = pitch.toLowerCase();
  const mine = place?.name.toLowerCase() ?? '';
  const namesOther = ctx.places.some((o) => {
    const name = o.name.toLowerCase();
    return o.placeId !== place?.placeId && name.length >= 3 && !mine.includes(name) && lower.includes(name);
  });
  if (namesOther) return code;
  const walks = [...pitch.matchAll(WALK_MIN_RE)].map((m) => Number(m[1]));
  if (walks.some((n) => !place || n !== place.walkMin)) return code;
  return pitch;
}

/** Turns a model (or mock) draft into a safe plan draft. Never throws. */
export function validateDraft(raw: RawDraft, ctx: CreateQuestContext): { draft: MuseQuestDraft; pitch: string } {
  const nowMs = ctx.now.getTime();
  const category = (QUEST_CATEGORIES as readonly string[]).includes(raw.category) ? raw.category as QuestCategory : 'other';
  const place = raw.placeId ? ctx.places.find((p) => p.placeId === raw.placeId) ?? null : null;

  let start = roundTo5(nowMs + 30 * 60_000);
  const clock = parseClock(raw.startClock);
  if (clock) start = nextClock(ctx.now, clock).getTime();
  else if (raw.startsInMinutes !== null && raw.startsInMinutes <= 0) start = Math.floor(nowMs / 60_000) * 60_000; // "now": live at once
  else if (raw.startsInMinutes !== null) start = roundTo5(nowMs + raw.startsInMinutes * 60_000);
  // Plans are for today-ish: anything over 24 h out (or in the past) falls back to 30 min from now.
  if (start < nowMs - 60_000 || start > nowMs + 24 * 60 * 60_000) start = roundTo5(nowMs + 30 * 60_000);
  const duration = clamp(raw.durationMinutes ?? 60, 15, 360);

  const priceMax = clamp(Math.round(raw.priceMax ?? place?.typicalCostUsd ?? 0), 0, 1000);
  const tags = [...new Set(raw.tags.map((t) => t.trim().toLowerCase()).filter((t) => t && t.length <= 40))].slice(0, 4);
  const bubble = raw.bubbleText ? clean(raw.bubbleText).slice(0, 80) : '';
  const title = clean(raw.title).slice(0, 120) || 'Hang out';
  const draft: MuseQuestDraft = {
    title,
    emoji: firstGrapheme(raw.emoji.trim()) || '✨',
    category,
    description: clean(raw.description).slice(0, 400),
    venueName: place?.name ?? 'Dropped pin',
    location: place?.location ?? ctx.pin,
    placeId: place?.placeId ?? null,
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + duration * 60_000).toISOString(),
    capacity: clamp(raw.capacity ?? 6, 2, 50),
    priceMax,
    tags,
    bubbleText: bubble || null,
  };
  const pitch = checkedPitch(raw, place, ctx);
  return { draft, pitch };
}

// ---------- mock (offline) ----------

// `place` matches a nearby place's "name category": a specific dish needs a place that serves it
// (tacos -> the taco trucks, never the dumpling shop); only generic "food" takes any food place.
const RULES: { re: RegExp; emoji: string; category: QuestCategory; tags: string[]; place?: RegExp; what: string }[] = [
  { re: /\bboba|bubble tea|milk tea\b/, emoji: '🧋', category: 'food', tags: ['boba'], place: /boba|bubble tea/i, what: 'boba spot' },
  { re: /\bcoffee|latte|cafe\b/, emoji: '☕', category: 'food', tags: ['coffee'], place: /coffee|\bcafe\b/i, what: 'coffee place' },
  { re: /\bdumpling/, emoji: '🥟', category: 'food', tags: ['dumplings'], place: /dumpling/i, what: 'dumpling place' },
  { re: /\bpho|ramen|noodle/, emoji: '🍜', category: 'food', tags: ['noodles'], place: /pho|ramen|noodle/i, what: 'noodle place' },
  { re: /\btaco/, emoji: '🌮', category: 'food', tags: ['tacos'], place: /taco/i, what: 'taco spot' },
  { re: /\bsushi/, emoji: '🍣', category: 'food', tags: ['sushi'], place: /sushi|kaiten/i, what: 'sushi place' },
  { re: /\blunch|dinner|eat|food|hungry\b/, emoji: '🍽️', category: 'food', tags: ['food'], place: /\bfood\b/i, what: 'place to eat' },
  { re: /\bstudy|homework|exam|midterm|cs club\b/, emoji: '📚', category: 'study', tags: ['study'], place: /library|study/i, what: 'study spot' },
  { re: /\bvolleyball|soccer|basketball|frisbee|pickup\b/, emoji: '🏐', category: 'sports', tags: ['pickup'], place: /court|\bsports\b/i, what: 'court' },
  { re: /\bclimb|boulder/, emoji: '🧗', category: 'sports', tags: ['climbing'], place: /climb|boulder/i, what: 'climbing gym' },
  { re: /\brun\b|\b5k\b|\bjog/, emoji: '🏃', category: 'outdoors', tags: ['running'], place: /trail|park|\boutdoors\b/i, what: 'trail' },
  { re: /\bwalk|sunset|park\b/, emoji: '🌅', category: 'outdoors', tags: ['walk'], place: /park|trail|overlook|\boutdoors\b/i, what: 'park' },
  { re: /\bthrift|vintage\b/, emoji: '🧥', category: 'thrift', tags: ['thrifting'], place: /thrift/i, what: 'thrift store' },
  { re: /\bboard games?|smash|games?\b/, emoji: '🎲', category: 'games', tags: ['games'], place: /game|arcade/i, what: 'game spot' },
  { re: /\bshow|band|music|open mic\b/, emoji: '🎸', category: 'music', tags: ['live music'], place: /music|signal room/i, what: 'music venue' },
  { re: /\bsketch|draw|art|gallery\b/, emoji: '🎨', category: 'art', tags: ['art'], place: /gallery|\bart\b/i, what: 'gallery' },
];

function clockFrom(h: string, m: string | undefined, ampm: string | undefined): string {
  let hour = Number(h);
  const minute = m ? Number(m) : 0;
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Deterministic stand-in for the model, used in mock mode, on failure, and by tests. */
export function mockDraft(ctx: CreateQuestContext): RawDraft {
  const text = ` ${ctx.text.toLowerCase().replace(/\s+/g, ' ')} `;
  const rule = RULES.find((r) => r.re.test(text)) ?? null;
  const at = /\bat (\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(text);
  const inMin = /\bin (\d+)\s*(?:min|mins|minutes)\b/.exec(text);
  const people = /\b(\d+)\s*(?:people|ppl|spots|of us)\b/.exec(text) ?? /\bme \+ ?(\d+)\b/.exec(text);
  const place = rule?.place ? ctx.places.find((p) => rule.place!.test(`${p.name} ${p.category}`)) ?? null : null;
  const title = ctx.text.trim()
    .replace(/\b(at \d{1,2}(:\d{2})?\s*(am|pm)?|in \d+\s*(min|mins|minutes)|today|tonight|rn|right now)\b/gi, '')
    .replace(/[,.!?]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  const nice = title ? title[0].toUpperCase() + title.slice(1) : 'Hang out';
  return {
    title: nice.slice(0, 60),
    emoji: rule?.emoji ?? '✨',
    category: rule?.category ?? 'other',
    description: place ? `${nice} at ${place.name}. Come say hi, all welcome.` : `${nice}. Come say hi, all welcome.`,
    placeId: place?.placeId ?? null,
    startClock: at ? clockFrom(at[1], at[2], at[3]) : null,
    startsInMinutes: at ? null : inMin ? Number(inMin[1]) : /\b(rn|right now|now)\b/.test(text) ? 0 : /\bafter class\b/.test(text) ? 60 : null,
    durationMinutes: null,
    capacity: people ? Number(people[1]) + (people[0].startsWith('me') ? 1 : 0) : null,
    priceMax: null,
    tags: rule?.tags ?? [],
    bubbleText: rule ? `${rule.emoji} ${nice}, come join` : `${nice}, come join`,
    pitch: place
      ? `I picked ${place.name}, ${place.walkMin} min from your pin.`
      : rule ? `No ${rule.what} right by your pin, so I kept your pin as the spot.` : 'I kept your pin as the spot.',
  };
}
