// Default PlanContextProvider: rebuilds the demo world from the seed files on each call, with
// times relative to `now`, using the same rules as scripts/seed.ts (same ids, same quest
// members, same availability owners). Homes of people other than Alex are not needed for
// planning, so they are a fixed hash offset instead of the seed's faker draw.
import seedContentJson from '../../../supabase/seed-content.json';
import seedPlacesJson from '../../../supabase/seed-places.json';
import {
  DEMO_AVAILABILITY, DEMO_CENTER, DEMO_DRIVER_HANDLE, DEMO_QUESTS, LOCAL_CIRCLES, NEVER_PRESEATED,
  PERSONA_HANDLES, deriveFriendGraph, floorToMinute, friendAdjacency, fuzzLocation, mulberry32,
  offsetPoint, profileId, questVisibilityFields, seedId, shuffled,
  type Availability, type ID, type LatLng, type Profile, type Quest,
} from '../../shared';
import {
  UnknownUserError, firstName, sharedInterests,
  type PlanContext, type PlanContextProvider, type PlanContextRequest,
} from './context';

type SeedPerson = {
  handle: string; name: string; bio?: string; interests?: string[]; budgetMax?: number;
  circles?: string[]; isDemoUser?: boolean; avatar?: string | null; cover?: string | null;
  pronouns?: string | null; age?: number | null; school?: string | null; major?: string | null;
  gradYear?: number | null; hometown?: string | null; currentCity?: string | null; job?: string | null;
};
type SeedGroup = { slug: string; memberHandles?: string[] };
type SeedPlace = { name: string; lat: number; lng: number };

const content = seedContentJson as unknown as { people: SeedPerson[]; groups: SeedGroup[] };
const places = (seedPlacesJson as unknown as { places: SeedPlace[] }).places;

const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type SeedWorld = {
  profiles: Profile[];
  byHandle: Map<string, Profile>;
  byId: Map<ID, Profile>;
  friendsOf: (id: ID) => ID[];
  quests: Quest[];
  availability: Availability[];
  questIdByKey: Map<string, ID>;
};

/** The demo world at `now` (pure; same input gives the same output). */
export function buildSeedWorld(now: Date): SeedWorld {
  const demoNow = floorToMinute(now);
  const people = content.people;
  const has = (h: string) => people.some((p) => p.handle === h);
  const circlesOf = new Map(people.map((p) => [p.handle, p.circles ?? []]));
  const isLocal = (h: string) => (circlesOf.get(h) ?? []).some((c) => LOCAL_CIRCLES.includes(c));

  const profiles: Profile[] = people.map((p) => {
    const home: LatLng = p.handle === 'alex'
      ? DEMO_CENTER
      : offsetPoint(DEMO_CENTER, 300 + (hash32(p.handle) % 2500), hash32(`${p.handle}:b`) % 360);
    return {
      id: profileId(p.handle), name: p.name, avatarUrl: p.avatar ?? `/seed/people/${p.handle}.webp`,
      bio: p.bio ?? '', interests: p.interests ?? [], budgetMax: Math.round(p.budgetMax ?? 20),
      home: { lat: Number(home.lat.toFixed(6)), lng: Number(home.lng.toFixed(6)) },
      isDemoUser: p.isDemoUser ?? false, handle: p.handle, coverUrl: p.cover ?? null,
      school: p.school ?? null, major: p.major ?? null, gradYear: p.gradYear ?? null,
      hometown: p.hometown ?? null, currentCity: p.currentCity ?? null, job: p.job ?? null,
      pronouns: p.pronouns ?? null, age: p.age ?? null, fieldVisibility: {},
    };
  });
  const byHandle = new Map(profiles.map((p) => [p.handle, p]));
  const byId = new Map(profiles.map((p) => [p.id, p]));

  const adj = friendAdjacency(deriveFriendGraph(people.map((p) => ({ handle: p.handle, circles: p.circles ?? [] }))));
  const friendsOf = (id: ID) => [...(adj.get(id) ?? [])].sort();
  const areFriends = (a: string, b: string) => adj.get(profileId(a))?.has(profileId(b)) ?? false;

  // quests: same member order as scripts/seed.ts
  const groupMembers = new Map(content.groups.map((g) => [g.slug, [...new Set((g.memberHandles ?? []).filter(has))]]));
  const placeByName = new Map(places.map((p) => [p.name, p]));
  const everyone = people.map((p) => p.handle).sort();
  const nonSeatable = new Set(NEVER_PRESEATED);
  const quests: Quest[] = [];
  const questIdByKey = new Map<string, ID>();
  DEMO_QUESTS.forEach((q, qi) => {
    const place = placeByName.get(q.placeName);
    if (!place) return;
    const rng = mulberry32(1000 + qi);
    const fromGroup = q.groupSlug ? groupMembers.get(q.groupSlug) ?? [] : [];
    const order = [...new Set([
      ...q.preferredMembers.filter(has),
      ...shuffled(fromGroup, rng),
      ...shuffled(everyone.filter(isLocal), rng),
      ...shuffled(everyone, rng),
    ])].filter((h) => !nonSeatable.has(h));
    const members = order.slice(0, Math.min(q.memberCount, q.capacity));
    if (members.length === 0) return;
    const id = seedId('quest', q.key);
    const exact = { lat: place.lat, lng: place.lng };
    const starts = addMin(demoNow, q.startsInMin);
    questIdByKey.set(q.key, id);
    quests.push({
      id, hostId: profileId(members[0]), title: q.title, emoji: q.emoji, category: q.category,
      description: q.description, venueName: place.name, location: exact,
      approxLocation: fuzzLocation(exact, id),
      startsAt: starts.toISOString(), endsAt: addMin(starts, q.durationMin).toISOString(),
      capacity: q.capacity, memberIds: members.map(profileId), priceMax: q.priceMax, tags: q.tags,
      status: members.length >= q.capacity ? 'full' : 'open',
      createdAt: addMin(demoNow, -(25 * 60 + qi * 7)).toISOString(),
      groupId: q.groupSlug && groupMembers.has(q.groupSlug) ? seedId('group', q.groupSlug) : null,
      placeId: seedId('place', place.name),
      ...questVisibilityFields(q.groupSlug && groupMembers.has(q.groupSlug) ? q.visibility ?? 'community' : 'community'),
      posterUrl: null, bubbleText: q.bubbleText ?? null,
    });
  });

  // availability: same owners as scripts/seed.ts
  const personaRank = (h: string) => {
    const i = (PERSONA_HANDLES as readonly string[]).indexOf(h);
    return i < 0 ? 99 : i;
  };
  const alexLocalFriends = everyone
    .filter((h) => h !== 'alex' && h !== 'maya' && areFriends('alex', h) && isLocal(h))
    .sort((a, b) => personaRank(a) - personaRank(b) || a.localeCompare(b));
  const availability: Availability[] = [];
  for (const a of DEMO_AVAILABILITY) {
    const handle = a.handle ?? alexLocalFriends[a.friendSlot ?? 0];
    if (!handle || !has(handle)) continue;
    const near = a.nearPlace ? placeByName.get(a.nearPlace) : null;
    const location = near ? { lat: near.lat, lng: near.lng } : byHandle.get(handle)!.home;
    availability.push({
      id: seedId('availability', `${handle}:${a.text}`), userId: profileId(handle), text: a.text,
      startsAt: addMin(demoNow, a.startsInMin).toISOString(), endsAt: addMin(demoNow, a.endsInMin).toISOString(),
      location, intent: null, createdAt: addMin(demoNow, Math.min(a.startsInMin, 0) - 10).toISOString(),
    });
  }

  return { profiles, byHandle, byId, friendsOf, quests, availability, questIdByKey };
}

/** Plan context for one viewer from a seed world. */
export function contextFromWorld(world: SeedWorld, req: PlanContextRequest): PlanContext {
  const key = req.userId ?? DEMO_DRIVER_HANDLE;
  const viewer = world.byId.get(key) ?? world.byHandle.get(key);
  if (!viewer) throw new UnknownUserError(key);
  const friendIds = new Set(world.friendsOf(viewer.id));
  const friends = [...friendIds]
    .map((id) => world.byId.get(id))
    .filter((p): p is Profile => !!p)
    .map((profile) => ({ profile, sharedInterests: sharedInterests(viewer.interests, profile.interests) }));
  return {
    viewer,
    friends,
    friendAvailability: world.availability.filter((a) => friendIds.has(a.userId)),
    quests: world.quests,
    location: req.location ?? DEMO_CENTER,
    now: req.now,
    knownPeople: world.profiles.map((p) => ({ id: p.id, firstName: firstName(p) })),
  };
}

export const seedPlanContextProvider: PlanContextProvider = {
  async getPlanContext(req) {
    return contextFromWorld(buildSeedWorld(req.now), req);
  },
};
