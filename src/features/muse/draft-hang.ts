// Muse drafts a hangout when nothing on the map fits (POST /api/muse/draft-hang).
// You and a friend are both free, but no posted plan fits: code lists the real places that are
// open, under budget, and walkable for both of you in time; Muse picks one and writes the title,
// why, and the invite. Code checks the pick and sets the times. Muse never invents a place.
import { z } from 'zod';
import { walkingMinutes, type LatLng, type OpeningHours, type QuestCategory, type WeekdayKey } from '../../shared';
import type { MuseMessage } from './client';
import { QUEST_CATEGORIES } from './create-quest';
import { localLabel } from './time';

/** Longest walk either person is asked to make. */
export const HANG_MAX_WALK_MIN = 25;
/** The hang must leave at least this long together before the first window closes. */
export const HANG_MIN_TOGETHER_MIN = 30;
const HANG_DEFAULT_MIN = 60;
const MAX_PLACES = 6;

export type HangPlaceInput = {
  id: string; name: string; category: string; typicalCostUsd: number; location: LatLng | null; hours: OpeningHours;
};
export type HangPlace = {
  placeId: string; name: string; category: string; typicalCostUsd: number; location: LatLng;
  myWalk: number; theirWalk: number;
};
export type HangPerson = { firstName: string; interests: string[]; location: LatLng };
export type HangContext = {
  text: string;
  now: Date;
  me: HangPerson;
  friend: HangPerson & { id: string; note: string | null };
  /** When the shared free time ends (the earlier of the two windows). */
  until: Date;
  budgetMax: number | null;
  places: HangPlace[];
};

export type HangDraft = {
  friendId: string;
  title: string; emoji: string; category: QuestCategory; description: string;
  placeId: string; venueName: string; location: LatLng;
  startsAt: string; endsAt: string; priceMax: number;
  myWalk: number; theirWalk: number;
  /** Muse's one-line why, written to the viewer. */
  pitch: string;
  /** The message the friend gets with the invite. */
  invite: string;
};

// ---------- opening hours (America/Los_Angeles) ----------

const WEEKDAYS: WeekdayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const laParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Local weekday and minutes since midnight in Menlo Park. */
export function laClock(d: Date): { day: WeekdayKey; min: number } {
  const p = Object.fromEntries(laParts.formatToParts(d).map((x) => [x.type, x.value]));
  const day = (p.weekday ?? 'Sun').slice(0, 3).toLowerCase() as WeekdayKey;
  return { day: WEEKDAYS.includes(day) ? day : 'sun', min: Number(p.hour) * 60 + Number(p.minute) };
}

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };

/** True when the place is open for the whole of [start, end] (same local day; past midnight counts as closed). */
export function openThrough(hours: OpeningHours, start: Date, end: Date): boolean {
  const s = laClock(start);
  const e = laClock(end);
  if (e.day !== s.day || e.min < s.min) return false;
  return (hours[s.day] ?? []).some(([o, c]) => toMin(o) <= s.min && e.min <= toMin(c));
}

// ---------- candidates (code) ----------

const FIVE_MIN = 5 * 60_000;
const roundUp5 = (ms: number) => Math.ceil(ms / FIVE_MIN) * FIVE_MIN;

/** When both can be there: now plus the longer walk, rounded up to 5 minutes. */
export function hangStart(now: Date, myWalk: number, theirWalk: number): Date {
  return new Date(roundUp5(now.getTime() + Math.max(myWalk, theirWalk) * 60_000));
}

/** Ends an hour in, or when the first window closes. */
export function hangEnd(start: Date, until: Date): Date {
  return new Date(Math.min(start.getTime() + HANG_DEFAULT_MIN * 60_000, until.getTime()));
}

/**
 * Real places both people can walk to, that are open for the hang, under budget, and leave at
 * least HANG_MIN_TOGETHER_MIN together. Nearest for the farther walker first.
 */
export function hangPlaces(
  places: HangPlaceInput[], me: LatLng, friend: LatLng, now: Date, until: Date, budgetMax: number | null,
): HangPlace[] {
  return places.flatMap((p) => {
    if (!p.location) return [];
    const myWalk = walkingMinutes(me, p.location);
    const theirWalk = walkingMinutes(friend, p.location);
    if (myWalk > HANG_MAX_WALK_MIN || theirWalk > HANG_MAX_WALK_MIN) return [];
    if (budgetMax !== null && p.typicalCostUsd > budgetMax) return [];
    const start = hangStart(now, myWalk, theirWalk);
    const end = hangEnd(start, until);
    if (end.getTime() - start.getTime() < HANG_MIN_TOGETHER_MIN * 60_000) return [];
    if (!openThrough(p.hours, start, end)) return [];
    return [{ placeId: p.id, name: p.name, category: p.category, typicalCostUsd: p.typicalCostUsd, location: p.location, myWalk, theirWalk }];
  }).sort((a, b) => Math.max(a.myWalk, a.theirWalk) - Math.max(b.myWalk, b.theirWalk)).slice(0, MAX_PLACES);
}

// ---------- the model step ----------

export const RawHangZ = z.object({
  placeId: z.string().nullable().catch(null),
  title: z.string().trim().min(1).max(120),
  emoji: z.string().trim().min(1).max(16).catch('✨'),
  category: z.string().trim().catch('other'),
  description: z.string().trim().max(400).catch(''),
  pitch: z.string().trim().max(300).catch(''),
  invite: z.string().trim().max(300).catch(''),
});
export type RawHang = z.output<typeof RawHangZ>;

export const RAW_HANG_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['placeId', 'title', 'emoji', 'category', 'description', 'pitch', 'invite'],
  properties: {
    placeId: { type: ['string', 'null'] }, title: { type: 'string' }, emoji: { type: 'string' },
    category: { type: 'string', enum: [...QUEST_CATEGORIES] }, description: { type: 'string' },
    pitch: { type: 'string' }, invite: { type: 'string' },
  },
};

/** "11:30 PM" (localLabel is "Thu 11:30 PM"). */
const clock = (d: Date) => localLabel(d).replace(/^\w{3},?\s+/, '');

export function hangMessages(ctx: HangContext): MuseMessage[] {
  const f = ctx.friend.firstName;
  return [
    {
      role: 'system',
      content: [
        'You are Muse inside Facebook\'s Out Here tab. Two friends are free at the same time, but nothing posted nearby fits.',
        `Draft one small, real-life plan for ${ctx.me.firstName} and ${f}, as JSON. ${ctx.me.firstName} reviews it and taps once to send it.`,
        `Current local time (America/Los_Angeles): ${localLabel(ctx.now)}. They are both free until ${clock(ctx.until)}.`,
        'Rules:',
        '- placeId: the id of the place from the list that best fits what they asked for and what they both like. Never invent a place; only ids from the list.',
        '- title: short and casual, 2-6 words, like a friend would write it ("Dumplings before the rush"). No emoji.',
        '- emoji: one emoji for the activity.',
        `- category: one of ${QUEST_CATEGORIES.join(', ')}.`,
        '- description: one friendly sentence about what happens. Do not invent prices, people, menus or events.',
        `- pitch: one sentence to ${ctx.me.firstName} saying why this fits both of them (shared interest, ${f}'s note, the walk). Use only facts given here. Say "you" for ${ctx.me.firstName}.`,
        `- invite: the message ${f} receives, in ${ctx.me.firstName}'s casual voice, under 120 characters. Mention the place.`,
        'Never mention JSON, ids or field names.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        asked: ctx.text,
        you: { firstName: ctx.me.firstName, interests: ctx.me.interests.slice(0, 8) },
        friend: { firstName: f, interests: ctx.friend.interests.slice(0, 8), note: ctx.friend.note },
        budget: ctx.budgetMax === null ? null : `$${ctx.budgetMax}`,
        places: ctx.places.map((p) => ({
          placeId: p.placeId, name: p.name, category: p.category,
          typicalCost: p.typicalCostUsd > 0 ? `$${p.typicalCostUsd}` : 'free',
          walk: `${p.myWalk} min for ${ctx.me.firstName}, ${p.theirWalk} min for ${f}`,
        })),
      }),
    },
  ];
}

// ---------- offline stand-in ----------

const PICKS: { re: RegExp; place: RegExp; emoji: string; category: QuestCategory; what: string }[] = [
  { re: /dumpling/, place: /dumpling/i, emoji: '🥟', category: 'food', what: 'Dumplings' },
  { re: /boba|bubble tea|milk tea/, place: /boba|bubble tea/i, emoji: '🧋', category: 'food', what: 'Boba' },
  { re: /coffee|latte|cafe/, place: /coffee|cafe/i, emoji: '☕', category: 'food', what: 'Coffee' },
  { re: /pho|ramen|noodle/, place: /pho|ramen|noodle/i, emoji: '🍜', category: 'food', what: 'Noodles' },
  { re: /taco/, place: /taco/i, emoji: '🌮', category: 'food', what: 'Tacos' },
  { re: /hungry|eat|food|lunch|dinner|snack/, place: /\bfood\b|dumpling|noodle|taco|pho/i, emoji: '🍜', category: 'food', what: 'Food' },
  { re: /walk|sunset|park|outside/, place: /park|trail|overlook|outdoors/i, emoji: '🌅', category: 'outdoors', what: 'A walk' },
  { re: /game|smash/, place: /game|arcade/i, emoji: '🎲', category: 'games', what: 'Games' },
  { re: /study|homework/, place: /library|study/i, emoji: '📚', category: 'study', what: 'Study session' },
  { re: /music|show|band/, place: /music/i, emoji: '🎸', category: 'music', what: 'Live music' },
];

/** Deterministic draft: the place matching the ask (else the nearest), plain copy. */
export function mockHang(ctx: HangContext): RawHang {
  const text = ctx.text.toLowerCase();
  const rule = PICKS.find((r) => r.re.test(text));
  const place = (rule && ctx.places.find((p) => rule.place.test(`${p.name} ${p.category}`))) ?? ctx.places[0];
  const f = ctx.friend.firstName;
  return {
    placeId: place?.placeId ?? null,
    title: rule ? `${rule.what} with ${f}` : `Hang with ${f}`,
    emoji: rule?.emoji ?? '✨',
    category: rule?.category ?? 'other',
    description: place ? `Meet at ${place.name}.` : '',
    pitch: place ? `${place.name} is ${place.myWalk} min for you and ${place.theirWalk} for ${f}, and you're both free.` : '',
    invite: place ? `You're free too, want to meet at ${place.name}?` : '',
  };
}

// ---------- validation (code) ----------

const FIELD_WORDS = /\b(placeId|JSON|typicalCost)\b/g;
const clean = (s: string) => s.replace(FIELD_WORDS, '').replace(/\s{2,}/g, ' ').trim();

/** Turns a model (or mock) answer into a safe draft, or null when no listed place is usable. Never throws. */
export function validateHang(raw: RawHang, ctx: HangContext): HangDraft | null {
  const place = ctx.places.find((p) => p.placeId === raw.placeId) ?? ctx.places[0];
  if (!place) return null;
  const picked = place.placeId === raw.placeId;
  const start = hangStart(ctx.now, place.myWalk, place.theirWalk);
  const end = hangEnd(start, ctx.until);
  const f = ctx.friend.firstName;
  const category = (QUEST_CATEGORIES as readonly string[]).includes(raw.category) ? raw.category as QuestCategory : 'other';
  const emoji = raw.emoji.trim() || '✨';
  // When Muse's pick was not on the list, its words describe another place: use plain copy.
  const fallback = mockHang({ ...ctx, places: [place] });
  return {
    friendId: ctx.friend.id,
    title: (picked ? clean(raw.title) : fallback.title).slice(0, 120) || `Hang with ${f}`,
    emoji: picked ? emoji : fallback.emoji,
    category: picked ? category : fallback.category as QuestCategory,
    description: (picked ? clean(raw.description) : fallback.description).slice(0, 400),
    placeId: place.placeId, venueName: place.name, location: place.location,
    startsAt: start.toISOString(), endsAt: end.toISOString(),
    priceMax: Math.max(0, Math.round(place.typicalCostUsd)),
    myWalk: place.myWalk, theirWalk: place.theirWalk,
    pitch: (picked && clean(raw.pitch)) || fallback.pitch,
    invite: ((picked && clean(raw.invite)) || fallback.invite).slice(0, 300),
  };
}
