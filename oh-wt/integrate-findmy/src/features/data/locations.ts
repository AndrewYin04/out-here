// Friend locations ("Find My" inside Facebook): pins for a viewer, the viewer's own share, and
// "Want to hang?" invites. Server-only; CoreStore exposes these as store methods.
//
// Rules (00-mission P0 1a and the overnight spec review):
// - A pin is shown only to an accepted friend for whom canSee(audience) holds; paused and
//   expired shares are hidden.
// - Approximate shares return the centre of an ~800 m grid cell, a city or neighbourhood label,
//   and distance / walking time rounded to 0.5 km / 5 min, computed from that returned point.
// - Realtime: an update sends user:<viewerId> {type:"location", id: ownerId} to every viewer in
//   the old and the new audience (and the owner), never a public per-location channel.
import {
  audienceListId, DEMO_CENTER, haversineMeters, now, snapToGrid, walkingMinutes,
  type Audience, type Availability, type FriendPin, type ID, type LatLng, type LocationPrecision,
  type LocationShare, type OpeningHours, type StatusBubble, type WeekdayKey,
} from '@/shared';
import { DEMO_TZ, formatDemoTime } from '@/shared/demo';
import { SHARE_TTL_MIN } from '@/shared/seed/locations';
import type { CoreStore } from './core';
import { badRequest, notFound } from './errors';
import { publish } from './realtime-server';
import type { View } from './view';

export const APPROX_CELL_M = 800;
/** Walking time is shown up to this many minutes; farther friends show distance only. */
export const MAX_SHOWN_WALK_MIN = 120;

// Labels for approximate shares: the nearest of these within 30 km, else the region name.
const AREAS: { label: string; at: LatLng }[] = [
  { label: 'Menlo Park', at: { lat: 37.4530, lng: -122.1817 } },
  { label: 'Belle Haven, Menlo Park', at: { lat: 37.4790, lng: -122.1560 } },
  { label: 'East Palo Alto', at: { lat: 37.4688, lng: -122.1411 } },
  { label: 'Palo Alto', at: { lat: 37.4419, lng: -122.1430 } },
  { label: 'Stanford', at: { lat: 37.4275, lng: -122.1697 } },
  { label: 'Redwood City', at: { lat: 37.4852, lng: -122.2364 } },
  { label: 'Atherton', at: { lat: 37.4613, lng: -122.1978 } },
  { label: 'Mountain View', at: { lat: 37.3861, lng: -122.0839 } },
  { label: 'San Carlos', at: { lat: 37.5072, lng: -122.2605 } },
  { label: 'San Mateo', at: { lat: 37.5630, lng: -122.3255 } },
  { label: 'Sunnyvale', at: { lat: 37.3688, lng: -122.0363 } },
  { label: 'San Jose', at: { lat: 37.3382, lng: -121.8863 } },
  { label: 'San Francisco, CA', at: { lat: 37.7749, lng: -122.4194 } },
  { label: 'Oakland, CA', at: { lat: 37.8044, lng: -122.2712 } },
  { label: 'Berkeley, CA', at: { lat: 37.8716, lng: -122.2727 } },
  { label: 'Sacramento, CA', at: { lat: 38.5816, lng: -121.4944 } },
  { label: 'Davis, CA', at: { lat: 38.5449, lng: -121.7405 } },
  { label: 'Los Angeles, CA', at: { lat: 34.0522, lng: -118.2437 } },
  { label: 'San Diego, CA', at: { lat: 32.7157, lng: -117.1611 } },
  { label: 'Reno, NV', at: { lat: 39.5296, lng: -119.8138 } },
  { label: 'Seattle, WA', at: { lat: 47.6062, lng: -122.3321 } },
  { label: 'Portland, OR', at: { lat: 45.5152, lng: -122.6784 } },
  { label: 'Denver, CO', at: { lat: 39.7392, lng: -104.9903 } },
  { label: 'Austin, TX', at: { lat: 30.2672, lng: -97.7431 } },
  { label: 'Minneapolis, MN', at: { lat: 44.9778, lng: -93.2650 } },
  { label: 'Chicago, IL', at: { lat: 41.8781, lng: -87.6298 } },
  { label: 'New York, NY', at: { lat: 40.7128, lng: -74.0060 } },
  { label: 'Honolulu, HI', at: { lat: 21.3069, lng: -157.8583 } },
];

/** City or neighbourhood name for a point (never a venue). */
export function areaLabel(p: LatLng): string {
  let best: { label: string; d: number } | null = null;
  for (const a of AREAS) {
    const d = haversineMeters(p, a.at);
    if (!best || d < best.d) best = { label: a.label, d };
  }
  return best && best.d < 30_000 ? best.label : 'Away';
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** The point, label, distance and walking time a viewer may see for one share. */
export function visibleLocation(share: Pick<LocationShare, 'location' | 'placeLabel' | 'precision'>, origin: LatLng): {
  location: LatLng; placeLabel: string | null; distanceKm: number; walkingMinutes: number | null;
} {
  if (share.precision === 'approximate') {
    const location = snapToGrid(share.location, APPROX_CELL_M);
    const km = haversineMeters(origin, location) / 1000;
    const walk = walkingMinutes(origin, location);
    return {
      location,
      placeLabel: areaLabel(location),
      distanceKm: Math.max(0.5, Math.round(km * 2) / 2),
      walkingMinutes: walk > MAX_SHOWN_WALK_MIN ? null : Math.max(5, Math.round(walk / 5) * 5),
    };
  }
  const walk = walkingMinutes(origin, share.location);
  return {
    location: share.location,
    placeLabel: share.placeLabel,
    distanceKm: round1(haversineMeters(origin, share.location) / 1000),
    walkingMinutes: walk > MAX_SHOWN_WALK_MIN ? null : walk,
  };
}

const isLive = (s: LocationShare, at: string) => !s.paused && s.expiresAt > at;

/** Can `viewerId` see `share` on their Friends map? Friends only, then the share's audience. */
export function canSeeShare(v: View, viewerId: ID, share: LocationShare, at: string): boolean {
  if (share.userId === viewerId) return false;
  if (!isLive(share, at)) return false;
  if (!v.areFriends(viewerId, share.userId)) return false;
  return v.canSee(viewerId, share.userId, share.audience);
}

/** Everyone an audience reaches among the owner's friends (owner excluded). */
export function audienceViewers(v: View, ownerId: ID, audience: Audience): ID[] {
  return [...v.friendIds(ownerId)].filter((id) => v.canSee(id, ownerId, audience));
}

export async function friendPins(store: CoreStore, viewerId: ID): Promise<FriendPin[]> {
  const v = await store.view();
  const at = now().toISOString();
  const shares = v.db.locationShares ?? [];
  const mine = shares.find((s) => s.userId === viewerId);
  const origin = mine?.location ?? v.profileById.get(viewerId)?.home ?? DEMO_CENTER;
  const pins: FriendPin[] = [];
  for (const s of shares) {
    if (!canSeeShare(v, viewerId, s, at)) continue;
    const profile = v.profileById.get(s.userId);
    if (!profile) continue;
    const availability = v.db.availability
      .filter((a) => a.userId === s.userId && a.endsAt > at && v.canSee(viewerId, a.userId, a.audience))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    let avail: Availability | null = null;
    if (availability) {
      const { audience: _a, ...rest } = availability;
      void _a;
      avail = s.precision === 'approximate' ? { ...rest, location: snapToGrid(rest.location, APPROX_CELL_M) } : rest;
    }
    pins.push({
      friend: v.profileFor(viewerId, profile),
      ...visibleLocation(s, origin),
      precision: s.precision,
      bubble: s.bubble,
      updatedAt: s.updatedAt,
      availability: avail,
    });
  }
  return pins.sort((a, b) => a.distanceKm - b.distanceKm || a.friend.name.localeCompare(b.friend.name));
}

export async function myLocation(store: CoreStore, viewerId: ID): Promise<LocationShare | null> {
  const v = await store.view();
  return (v.db.locationShares ?? []).find((s) => s.userId === viewerId) ?? null;
}

export type LocationPatch = {
  location?: LatLng;
  placeLabel?: string | null;
  precision?: LocationPrecision;
  audience?: Audience;
  paused?: boolean;
  bubble?: Partial<StatusBubble>;
};

const clean = (s: string | null | undefined) => {
  if (s === undefined) return undefined;
  const t = (s ?? '').trim();
  return t ? t : null;
};

export async function updateMyLocation(store: CoreStore, viewerId: ID, patch: LocationPatch): Promise<LocationShare> {
  const v = await store.view();
  const old = (v.db.locationShares ?? []).find((s) => s.userId === viewerId) ?? null;
  if (patch.audience) {
    const listId = audienceListId(patch.audience);
    if (listId && !v.db.friendLists.some((l) => l.id === listId && l.ownerId === viewerId)) {
      throw badRequest('audience: unknown friend list');
    }
  }
  const me = v.profileById.get(viewerId);
  if (!me) throw notFound('person_not_found');
  const t = now();
  const bubble: StatusBubble = {
    emoji: old?.bubble.emoji ?? null, thought: old?.bubble.thought ?? null,
    doing: old?.bubble.doing ?? null, wantsTo: old?.bubble.wantsTo ?? null,
  };
  if (patch.bubble) {
    for (const k of ['emoji', 'thought', 'doing', 'wantsTo'] as const) {
      const val = clean(patch.bubble[k]);
      if (val !== undefined) bubble[k] = val;
    }
  }
  const next: LocationShare = {
    userId: viewerId,
    location: patch.location ?? old?.location ?? me.home ?? DEMO_CENTER,
    placeLabel: patch.placeLabel !== undefined ? clean(patch.placeLabel) ?? null : old?.placeLabel ?? null,
    // first-time sharing defaults to approximate
    precision: patch.precision ?? old?.precision ?? 'approximate',
    audience: patch.audience ?? old?.audience ?? 'friends',
    paused: patch.paused ?? old?.paused ?? false,
    bubble,
    updatedAt: t.toISOString(),
    expiresAt: new Date(t.getTime() + SHARE_TTL_MIN * 60_000).toISOString(),
  };
  await store.backend.upsert('locationShares', [next]);
  const reach = new Set<ID>([viewerId, ...audienceViewers(v, viewerId, next.audience)]);
  if (old) for (const id of audienceViewers(v, viewerId, old.audience)) reach.add(id);
  await Promise.all([...reach].map((id) => publish(`user:${id}`, { type: 'location', id: viewerId })));
  return next;
}

export type HangBody = { toId: ID; questId?: ID | null; placeId?: ID | null; message: string };

/** The checked facts a hang was picked from; Muse writes its reason and draft from these only. */
export type HangFacts = {
  friendFirstName: string;
  bubble: StatusBubble;
  /** The friend's shared free window, if any: its note and end time. */
  freeText: string | null; freeUntil: string | null;
  /** The friend's words the pick matched, or null when it is only near and soon. */
  matched: HangText | null;
  /** "at 10:32 AM" or "now" for a quest; null for a place. */
  when: string | null;
  theirWalkMinutes: number;
};

/** What "Want to hang?" proposes for one friend, shown on the card before the invite is sent. */
export type HangSuggestion = {
  kind: 'quest' | 'place';
  questId: ID | null; placeId: ID | null;
  title: string; emoji: string; venueName: string;
  startsAt: string | null; seatsLeft: number | null; walkMinutes: number;
  /** The friend's own words it matched, quoted, then the data: Maya's status: “craving dumplings” · 2 seats left · 9 min walk. */
  reason: string;
  /** Prefilled invite message. */
  draft: string;
  /** Who wrote reason and draft: Muse, or the code template when Muse is off, slow or rejected. */
  writtenBy: 'muse' | 'template';
  /** True when Muse ran in mock mode (dev); the card labels it [mock]. */
  museMock?: boolean;
  facts: HangFacts;
};

/** A hang must be reachable on foot by both people within this many minutes. */
export const HANG_MAX_WALK_MIN = 25;
/** Quests starting within this many minutes are suggested, or later ones inside the friend's free window. */
const HANG_MAX_START_MIN = 120;
/** A quest inside the friend's shared free window may start up to this many minutes out. */
const HANG_MAX_WINDOW_START_MIN = 300;
/** "Right now": a matching quest starting within this many minutes beats a matching place, and both beat later quests. */
const HANG_SOON_MIN = 60;
// Words that say nothing about what to do together ("walk somewhere after", "new here, say hi").
const STOP = new Set([
  'the', 'and', 'for', 'with', 'want', 'wants', 'try', 'new', 'some', 'about', 'after', 'before', 'till', 'until',
  'work', 'break', 'again', 'still', 'just', 'need', 'someone', 'anyone', 'going', 'more', 'like', 'into', 'this',
  'that', 'from', 'lunch', 'min', 'hour', 'today', 'tonight', 'walk', 'somewhere', 'here', 'say', 'second',
  'free', 'next', 'long', 'down', 'later', 'can', 'working', 'place', 'people', 'find', 'grab', 'craving', 'brain',
  'energy', 'repeat', 'home', 'day', 'night', 'out', 'get', 'any', 'all', 'one', 'our', 'you', 'your',
]);

/** Extra words a place of each category answers to ("need a second coffee" -> a cafe). */
const PLACE_WORDS: Record<string, string[]> = {
  cafe: ['coffee', 'cafe', 'latte', 'tea', 'boba'],
  food: ['food', 'eat', 'dinner', 'hungry', 'snack'],
  games: ['game', 'board', 'arcade'],
  climbing: ['climbing', 'climb', 'bouldering', 'boulder'],
  art: ['art', 'gallery', 'sketch', 'sketching'],
  music_venue: ['music', 'show', 'band', 'live'],
  photo: ['film', 'photo', 'photography'],
  park: ['sunset', 'park', 'outdoors'],
  outdoors: ['trail', 'running', 'bike', 'ride', 'outdoors'],
  library: ['study', 'read', 'quiet'],
  thrift: ['thrift', 'thrifting', 'vintage'],
  sports: ['volleyball', 'pickup', 'sports', 'hoops'],
};

/** Lowercase word stems of 3+ letters, plural "s" dropped ("dumplings" -> "dumpling"). */
export function stems(text: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const w of (text ?? '').toLowerCase().split(/[^a-z]+/)) {
    if (w.length < 3 || STOP.has(w)) continue;
    out.add(w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w);
  }
  return out;
}

/** Which part of the friend's status a quest matched; the reason line quotes it. */
export type HangSource = 'thought' | 'wantsTo' | 'free' | 'doing';
export type HangText = { source: HangSource; text: string; weight: number };

/** The friend's own words, strongest first: their thought and wish, their free note, then what they are doing. */
export function hangTexts(bubble: StatusBubble, freeText: string | null): HangText[] {
  const out: HangText[] = [];
  if (bubble.thought) out.push({ source: 'thought', text: bubble.thought, weight: 3 });
  if (bubble.wantsTo) out.push({ source: 'wantsTo', text: bubble.wantsTo, weight: 3 });
  if (freeText) out.push({ source: 'free', text: freeText, weight: 3 });
  if (bubble.doing) out.push({ source: 'doing', text: bubble.doing, weight: 1 });
  return out;
}

/** Weighted count of the friend's words the quest also has, and the first text that matched. */
export function matchHang(texts: HangText[], words: Set<string>): { score: number; matched: HangText | null } {
  let score = 0;
  let matched: HangText | null = null;
  for (const t of texts) {
    let hits = 0;
    for (const w of stems(t.text)) if (words.has(w)) hits += 1;
    if (hits > 0) { score += hits * t.weight; matched ??= t; }
  }
  return { score, matched };
}

/** 'Maya's status: “craving dumplings”' or 'Ethan's free note: “board games tonight?”'. */
export function quoteFor(name: string, t: HangText): string {
  const q = `“${t.text}”`;
  if (t.source === 'thought') return `${name}'s status: ${q}`;
  if (t.source === 'wantsTo') return `${name} wants to: ${q}`;
  if (t.source === 'free') return `${name}'s free note: ${q}`;
  return `${name} right now: ${q}`;
}

const minutesUntil = (iso: string, atMs: number) => Math.round((new Date(iso).getTime() - atMs) / 60_000);
const seatsText = (n: number) => `${n} ${n === 1 ? 'seat' : 'seats'} left`;

/** Is the place open at `at` (DEMO_TZ wall clock)? A place with no hours listed counts as open. */
export function isOpenAt(hours: OpeningHours | null | undefined, at: Date): boolean {
  if (!hours || Object.keys(hours).length === 0) return true;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DEMO_TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = get('weekday').toLowerCase().slice(0, 3) as WeekdayKey;
  const hm = `${get('hour').padStart(2, '0')}:${get('minute').padStart(2, '0')}`;
  return (hours[day] ?? []).some(([open, close]) => hm >= open && hm < close);
}

/**
 * Picks the hang for `toId`, leaning toward right now. Candidates are open public quests and
 * open places that both people can walk to within 25 min. A quest must start within 2 hours,
 * or (up to 5 hours out) both overlap the friend's shared free window and let them arrive before
 * it ends. Order: a quest matching the friend's own words that starts within 60 min; then a
 * place that matches them ("need a second coffee" -> a cafe); then a later matching quest; then
 * any quest starting within 60 min; then any later quest; then the place nearest the friend.
 * A place that hosts a matching quest is left out, so the quest is offered instead.
 * Words: thought, wish and free note count 3 each, what they are doing counts 1 (and not at all
 * for places). Walking times are measured from the viewer's own share, the point their "You" pin
 * sits on. A friend with nothing within 25 min on foot (another city) gets no suggestion.
 */
export async function hangSuggestion(store: CoreStore, viewerId: ID, toId: ID): Promise<HangSuggestion | null> {
  const v = await store.view();
  const to = v.profileById.get(toId) ?? v.profileByHandle.get(toId);
  if (!to) throw notFound('person_not_found');
  const at = now();
  const atIso = at.toISOString();
  const shares = v.db.locationShares ?? [];
  const share = shares.find((s) => s.userId === to.id);
  if (!share || !canSeeShare(v, viewerId, share, atIso)) return null;
  const mine = shares.find((s) => s.userId === viewerId);
  const origin = mine?.location ?? v.profileById.get(viewerId)?.home ?? DEMO_CENTER;
  const friendAt = visibleLocation(share, origin).location;
  const name = to.name.split(' ')[0] ?? to.name;
  const free = v.db.availability
    .filter((a) => a.userId === to.id && a.endsAt > atIso && v.canSee(viewerId, a.userId, a.audience))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null;
  const freeUntil = free?.endsAt ?? null;
  const freeFrom = free?.startsAt ?? null;
  const texts = hangTexts(share.bubble, free?.text ?? null);
  const maxStartMin = freeUntil
    ? Math.min(HANG_MAX_WINDOW_START_MIN, Math.max(HANG_MAX_START_MIN, minutesUntil(freeUntil, at.getTime())))
    : HANG_MAX_START_MIN;
  const facts = (matched: HangText | null, when: string | null, theirWalkMinutes: number): HangFacts => ({
    friendFirstName: name, bubble: share.bubble, freeText: free?.text ?? null, freeUntil, matched, when, theirWalkMinutes,
  });

  const quests = v.db.quests
    .filter((q) => q.isPublic && v.isActiveQuest(q) && v.seatsLeft(q) > 0)
    .map((q) => {
      const words = new Set([...stems(q.title), ...stems(q.venueName), ...stems(q.category), ...q.tags.flatMap((t) => [...stems(t)])]);
      const myWalk = walkingMinutes(origin, q.approxLocation);
      const theirWalk = walkingMinutes(friendAt, q.approxLocation);
      const arriveMs = Math.max(new Date(q.startsAt).getTime(), at.getTime() + theirWalk * 60_000);
      const fitsWindow = !freeUntil || arriveMs < new Date(freeUntil).getTime();
      // a later quest must overlap the friend's window, not end before it opens
      const overlapsWindow = !freeFrom || new Date(q.endsAt).getTime() > new Date(freeFrom).getTime();
      const startsIn = minutesUntil(q.startsAt, at.getTime());
      return { q, ...matchHang(texts, words), myWalk, theirWalk, fitsWindow, startsIn, overlapsWindow };
    })
    .filter((x) => x.myWalk <= HANG_MAX_WALK_MIN && x.theirWalk <= HANG_MAX_WALK_MIN
      && (x.startsIn <= HANG_MAX_START_MIN || (x.overlapsWindow && x.fitsWindow && x.startsIn <= maxStartMin)));

  // what they are doing ("working from a cafe") says where they are, not what they want
  const wishes = texts.filter((t) => t.source !== 'doing');
  // a matching plan already set at a place beats "meet there" (it has seats and people)
  const questVenues = new Set(quests.filter((x) => x.score > 0).map((x) => x.q.venueName));
  const places = v.db.places
    .filter((p) => isOpenAt(p.hours, at) && !questVenues.has(p.name))
    .map((p) => {
      // the place's own name counts double: "coffee" picks El Camino Coffee Works over a boba cafe
      const byName = matchHang(wishes, stems(p.name));
      const byKind = matchHang(wishes, new Set([...stems(p.category), ...(PLACE_WORDS[p.category] ?? []).flatMap((w) => [...stems(w)])]));
      const myWalk = walkingMinutes(origin, p.location);
      const theirWalk = walkingMinutes(friendAt, p.location);
      return { p, score: byName.score * 2 + byKind.score, matched: byName.matched ?? byKind.matched, myWalk, theirWalk };
    })
    .filter((x) => x.myWalk <= HANG_MAX_WALK_MIN && x.theirWalk <= HANG_MAX_WALK_MIN);

  type QuestCand = (typeof quests)[number];
  type PlaceCand = (typeof places)[number];
  type Pick = { tier: number; score: number; fits: number; walk: number; quest?: QuestCand; place?: PlaceCand };
  const soon = (x: QuestCand) => x.startsIn <= HANG_SOON_MIN;
  const picks: Pick[] = [
    ...quests.map((x): Pick => ({
      tier: x.score > 0 ? (soon(x) ? 0 : 2) : (soon(x) ? 3 : 4),
      score: x.score, fits: Number(x.fitsWindow), walk: x.myWalk, quest: x,
    })),
    ...places.map((x): Pick => ({
      tier: x.score > 0 ? 1 : 5, score: x.score, fits: 1,
      walk: x.score > 0 ? x.myWalk + x.theirWalk : x.theirWalk, place: x,
    })),
  ].sort((a, b) => a.tier - b.tier || b.score - a.score || b.fits - a.fits || a.walk - b.walk);
  const pick = picks[0];
  if (!pick) return null;

  if (pick.quest) {
    const { q, matched, myWalk, theirWalk, startsIn } = pick.quest;
    const seats = v.seatsLeft(q);
    const when = startsIn > 0 ? `at ${formatDemoTime(q.startsAt)}` : 'now';
    const said = matched?.text.trim() ?? '';
    const why = matched && matched.source !== 'doing' ? ` Saw your “${said}”${/[.?!]$/.test(said) ? '' : '.'}` : '';
    const lead = matched ? quoteFor(name, matched) : `Close to you both, starts ${when}`;
    return {
      kind: 'quest', questId: q.id, placeId: null, title: q.title, emoji: q.emoji, venueName: q.venueName,
      startsAt: q.startsAt, seatsLeft: seats, walkMinutes: myWalk,
      reason: `${lead} · ${seatsText(seats)} · ${myWalk} min walk`,
      draft: `${q.venueName} ${when}?${why} ${seatsText(seats)}, I'll grab one.`,
      writtenBy: 'template',
      facts: facts(matched, when, theirWalk),
    };
  }
  const { p: place, matched, myWalk: walk, theirWalk } = pick.place!;
  const lead = matched ? quoteFor(name, matched) : texts[0] ? quoteFor(name, texts[0]) : `${name} is nearby`;
  return {
    kind: 'place', questId: null, placeId: place.id, title: `Meet at ${place.name}`, emoji: '📍', venueName: place.name,
    startsAt: null, seatsLeft: null, walkMinutes: walk,
    reason: `${lead} · ${place.name} is ${theirWalk} min from them · ${walk} min walk for you`,
    draft: `Want to meet at ${place.name}? I can be there in ${walk} min.`,
    writtenBy: 'template',
    facts: facts(matched, null, theirWalk),
  };
}

/** "Want to hang?": an invite to a friend for a quest or place near them (picked when not given). */
export async function hangInvite(store: CoreStore, viewerId: ID, body: HangBody) {
  const v = await store.view();
  const to = v.profileById.get(body.toId) ?? v.profileByHandle.get(body.toId);
  if (!to) throw notFound('person_not_found');
  let questId: ID | null = body.questId ?? null;
  let title: string | null = null;
  if (questId) {
    const q = v.questById.get(questId);
    if (!q) throw notFound('quest_not_found');
    title = `${q.emoji} ${q.title}`;
  } else if (body.placeId) {
    const p = v.db.places.find((x) => x.id === body.placeId);
    if (!p) throw notFound('place_not_found');
    title = `Meet at ${p.name}`;
  } else {
    const s = await hangSuggestion(store, viewerId, to.id);
    if (s) { questId = s.questId; title = s.kind === 'quest' ? `${s.emoji} ${s.title}` : s.title; }
  }
  const suggestionTitle = title ?? 'Want to hang?';
  const invite = await store.createInvite(viewerId, {
    toId: to.id, questId, suggestionTitle, message: body.message.trim() || 'Want to hang?',
  });
  return { invite, suggestion: suggestionTitle };
}
