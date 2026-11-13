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
  type LocationShare, type StatusBubble,
} from '@/shared';
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
  { label: 'Union Square, San Francisco', at: { lat: 37.7895, lng: -122.4078 } },
  { label: 'Chinatown, San Francisco', at: { lat: 37.7931, lng: -122.4069 } },
  { label: 'SoMa, San Francisco', at: { lat: 37.7857, lng: -122.4025 } },
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
  const origin = mine?.location ?? DEMO_CENTER;
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

/** What "Want to hang?" proposes for one friend, shown on the card before the invite is sent. */
export type HangSuggestion = {
  kind: 'quest' | 'place';
  questId: ID | null; placeId: ID | null;
  title: string; emoji: string; venueName: string;
  startsAt: string | null; seatsLeft: number | null; walkMinutes: number;
  /** Built from the friend's bubble and the data: "Maya's craving dumplings · 2 seats left · 9 min walk". */
  reason: string;
  /** Prefilled invite message. */
  draft: string;
};

/** A hang must be reachable on foot by both people within this many minutes. */
const HANG_MAX_WALK_MIN = 25;
/** Only quests starting within this many minutes are suggested. */
const HANG_MAX_START_MIN = 120;
const STOP = new Set([
  'the', 'and', 'for', 'with', 'want', 'wants', 'try', 'new', 'some', 'about', 'after', 'before', 'till', 'until',
  'work', 'break', 'again', 'still', 'just', 'need', 'someone', 'anyone', 'going', 'more', 'like', 'into', 'this',
  'that', 'from', 'lunch', 'min', 'hour', 'today', 'tonight',
]);

/** Lowercase word stems of 3+ letters, plural "s" dropped ("dumplings" -> "dumpling"). */
export function stems(text: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const w of (text ?? '').toLowerCase().split(/[^a-z]+/)) {
    if (w.length < 3 || STOP.has(w)) continue;
    out.add(w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w);
  }
  return out;
}

/** How many words of the bubble ("craving dumplings", "try Dumpling Den") the quest also has. */
function bubbleHits(bubble: StatusBubble, words: Set<string>): number {
  const want = new Set([...stems(bubble.thought), ...stems(bubble.wantsTo), ...stems(bubble.doing)]);
  let hits = 0;
  for (const w of want) if (words.has(w)) hits += 1;
  return hits;
}

const minutesUntil = (iso: string, atMs: number) => Math.round((new Date(iso).getTime() - atMs) / 60_000);
const seatsText = (n: number) => `${n} ${n === 1 ? 'seat' : 'seats'} left`;

/**
 * Picks the hang for `toId`: an open public quest both people can walk to within 25 min that starts
 * within 2 hours, ranked by how many words of the friend's bubble it matches, then by whether the
 * friend can get there before their shared free window ends, then by the viewer's walking time.
 * Falls back to the place nearest the friend.
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
  const origin = mine?.location ?? DEMO_CENTER;
  const friendAt = visibleLocation(share, origin).location;
  const name = to.name.split(' ')[0] ?? to.name;
  const freeUntil = v.db.availability
    .filter((a) => a.userId === to.id && a.endsAt > atIso && v.canSee(viewerId, a.userId, a.audience))
    .map((a) => a.endsAt).sort()[0] ?? null;
  const b = share.bubble;

  const ranked = v.db.quests
    .filter((q) => q.isPublic && v.isActiveQuest(q) && v.seatsLeft(q) > 0)
    .map((q) => {
      const words = new Set([...stems(q.title), ...stems(q.venueName), ...stems(q.category), ...q.tags.flatMap((t) => [...stems(t)])]);
      const myWalk = walkingMinutes(origin, q.approxLocation);
      const theirWalk = walkingMinutes(friendAt, q.approxLocation);
      const arriveMs = Math.max(new Date(q.startsAt).getTime(), at.getTime() + theirWalk * 60_000);
      const fitsWindow = !freeUntil || arriveMs < new Date(freeUntil).getTime();
      return { q, hits: bubbleHits(b, words), myWalk, theirWalk, fitsWindow };
    })
    .filter((x) => x.myWalk <= HANG_MAX_WALK_MIN && x.theirWalk <= HANG_MAX_WALK_MIN
      && minutesUntil(x.q.startsAt, at.getTime()) <= HANG_MAX_START_MIN)
    .sort((x, y) => y.hits - x.hits || Number(y.fitsWindow) - Number(x.fitsWindow) || x.myWalk - y.myWalk);
  const pick = ranked[0];
  const said = b.thought ? `${name}'s ${b.thought}` : b.wantsTo ? `${name} wants to ${b.wantsTo}` : `${name} is nearby`;
  if (pick) {
    const q = pick.q;
    const seats = v.seatsLeft(q);
    const startsIn = minutesUntil(q.startsAt, at.getTime());
    const when = startsIn > 0 ? `in ${startsIn} min` : 'now';
    const why = pick.hits > 0 && b.thought ? ` You said you're ${b.thought}.` : '';
    return {
      kind: 'quest', questId: q.id, placeId: null, title: q.title, emoji: q.emoji, venueName: q.venueName,
      startsAt: q.startsAt, seatsLeft: seats, walkMinutes: pick.myWalk,
      reason: `${said} · ${seatsText(seats)} · ${pick.myWalk} min walk`,
      draft: `${q.venueName} ${when}?${why} ${seatsText(seats)}, I'll grab one.`,
    };
  }
  const place = [...v.db.places].sort((a, c) => haversineMeters(friendAt, a.location) - haversineMeters(friendAt, c.location))[0];
  if (!place) return null;
  const walk = walkingMinutes(origin, place.location);
  return {
    kind: 'place', questId: null, placeId: place.id, title: `Meet at ${place.name}`, emoji: '📍', venueName: place.name,
    startsAt: null, seatsLeft: null, walkMinutes: walk,
    reason: `${said} · ${place.name} is near them · ${walk} min walk for you`,
    draft: `Want to meet at ${place.name}? I can be there in ${walk} min.`,
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
