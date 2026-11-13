// Pure seed row builder shared by scripts/seed.ts (writes Postgres) and the MemoryStore
// (builds the same rows in-process). No Node imports, so it runs inside Next route handlers.
import { faker } from '@faker-js/faker/locale/en';
import { z } from 'zod';
import { DEMO_CENTER, demoDate, floorToHour, PERSONA_HANDLES } from '../../shared/demo';
import { fuzzLocation, offsetPoint } from '../../shared/geo';
import { deriveFriendGraph, friendAdjacency, LOCAL_CIRCLES } from '../../shared/seed/graph';
import { mulberry32, profileId, seedId, shuffled } from '../../shared/seed/ids';
import {
  DAILY_PROMPTS, DEMO_AVAILABILITY, DEMO_QUESTS, NEVER_PRESEATED, PAST_HANGOUTS,
} from '../../shared/seed/story';
import { SEED_LOCATION_SHARES, SHARE_TTL_MIN } from '../../shared/seed/locations';
import { SEED_INTRO_PROFILES } from '../../shared/seed/intros';
import { REACTION_TYPES, type ProfileField, type Audience } from '../../shared/types';

// ---------- content contract ----------
const ReactionCountsZ = z.object(Object.fromEntries(REACTION_TYPES.map((t) => [t, z.number().int().min(0).default(0)])))
  .partial()
  .default({});
const ReplyZ = z.object({ authorHandle: z.string(), text: z.string(), minutesAfter: z.number().default(30) });
const CommentZ = ReplyZ.extend({ replies: z.array(ReplyZ).default([]) });

export const SeedContentZ = z.object({
  people: z.array(z.object({
    handle: z.string(),
    name: z.string(),
    pronouns: z.string().nullish(),
    age: z.number().int().nullish(),
    school: z.string().nullish(),
    major: z.string().nullish(),
    gradYear: z.number().int().nullish(),
    hometown: z.string().nullish(),
    currentCity: z.string().nullish(),
    job: z.string().nullish(),
    bio: z.string().default(''),
    interests: z.array(z.string()).default([]),
    budgetMax: z.number().default(20),
    circles: z.array(z.string()).default([]),
    isDemoUser: z.boolean().default(false),
    avatar: z.string().nullish(),
    cover: z.string().nullish(),
  })),
  groups: z.array(z.object({
    slug: z.string(),
    name: z.string(),
    privacy: z.enum(['public', 'private']).default('public'),
    description: z.string().default(''),
    tags: z.array(z.string()).default([]),
    cover: z.string().nullish(),
    memberHandles: z.array(z.string()).default([]),
  })).default([]),
  posts: z.array(z.object({
    id: z.string(),
    authorHandle: z.string(),
    target: z.union([
      z.object({ type: z.literal('profile') }),
      z.object({ type: z.literal('group'), slug: z.string() }),
    ]).default({ type: 'profile' }),
    audience: z.string().default('friends'),
    text: z.string(),
    image: z.string().nullish(),
    hoursAgo: z.number().min(0),
    reactions: ReactionCountsZ,
    comments: z.array(CommentZ).default([]),
  })).default([]),
  stories: z.array(z.object({ authorHandle: z.string(), image: z.string(), hoursAgo: z.number().min(0) })).default([]),
  threads: z.array(z.object({
    id: z.string(),
    name: z.string().nullish(),
    memberHandles: z.array(z.string()),
    messages: z.array(z.object({ fromHandle: z.string(), text: z.string(), minutesAgo: z.number().min(0) })),
  })).default([]),
  events: z.array(z.object({
    slug: z.string(),
    title: z.string(),
    groupSlug: z.string().nullish(),
    hostHandle: z.string(),
    placeName: z.string(),
    startsInHours: z.number(),
    durationHours: z.number().default(2),
    priceUsd: z.number().default(0),
    capacity: z.number().int().nullish(),
    category: z.enum(['music', 'food', 'sports', 'social', 'study', 'arts']),
    description: z.string().default(''),
    cover: z.string().nullish(),
    goingHandles: z.array(z.string()).default([]),
    interestedHandles: z.array(z.string()).default([]),
  })).default([]),
  listings: z.array(z.object({
    id: z.string(),
    sellerHandle: z.string(),
    title: z.string(),
    priceUsd: z.number(),
    condition: z.string().default(''),
    category: z.string().default(''),
    description: z.string().default(''),
    image: z.string().nullish(),
    hoursAgo: z.number().min(0).default(24),
  })).default([]),
});
export type SeedContent = z.infer<typeof SeedContentZ>;

export const PlacesZ = z.object({
  places: z.array(z.object({
    name: z.string(), category: z.string(), address: z.string().default(''),
    lat: z.number(), lng: z.number(), priceLevel: z.number().int().min(1).max(4),
    typicalCostUsd: z.number(), description: z.string().default(''),
    hours: z.record(z.string(), z.array(z.tuple([z.string(), z.string()]))),
  })),
});
export type SeedPlaces = z.infer<typeof PlacesZ>;

// ---------- build ----------
export type Row = Record<string, unknown>;
export type SeedTables = Record<(typeof TABLE_ORDER)[number], Row[]>;

/** Insert order (parents first). TRUNCATE uses the same list. muse_runs is never touched. */
export const TABLE_ORDER = [
  'profiles', 'places', 'groups', 'group_members', 'friendships', 'friend_lists', 'friend_list_members',
  'quests', 'quest_members', 'quest_checkins', 'quest_reports', 'availability', 'invites', 'crews', 'crew_members', 'memories',
  'daily_quests', 'daily_entries', 'events', 'event_rsvps', 'posts', 'comments', 'reactions',
  'stories', 'threads', 'thread_members', 'messages', 'notifications', 'listings', 'reels', 'location_shares',
  'intro_profiles', 'intros',
  'listing_holds', 'muse_wants',
] as const;

const DEFAULT_VISIBILITY: Partial<Record<ProfileField, Audience>> = {
  school: 'public', major: 'public', gradYear: 'friends', hometown: 'friends',
  currentCity: 'public', job: 'public', pronouns: 'public',
};

/** Seeded listings open for pickup on the Out Here map (ids from seed-content.json). */
const PICKUP_LISTINGS = [
  { id: 'l04', meters: 2600, bearing: 200, openMin: 150, listedMinAgo: 70, label: 'Downtown Menlo Park', spot: 'Bench outside the library, Alma St' },
  { id: 'l10', meters: 1700, bearing: 95, openMin: 210, listedMinAgo: 35, label: 'East Palo Alto', spot: 'Front porch, white house on Bay Rd' },
  { id: 'l05', meters: 1200, bearing: 300, openMin: 90, listedMinAgo: 20, label: 'Belle Haven', spot: 'Lobby of the Hamilton Ave apartments' },
  { id: 'l26', meters: 3400, bearing: 160, openMin: 240, listedMinAgo: 120, label: 'Palo Alto', spot: 'Driveway, green door on Middlefield' },
] as const;
/** What Alex told Muse yesterday; the demo seller lists a matching chair live. */
export const ALEX_WANT = {
  text: 'I need a desk chair under $40, ideally within a 15-minute drive',
  item: 'desk chair', keywords: ['desk chair', 'office chair', 'chair'], maxPrice: 40, maxDriveMin: 15,
};

const iso = (d: Date) => d.toISOString();
const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const minDate = (a: Date, b: Date) => (a < b ? a : b);

export type BuildResult = { tables: SeedTables; warnings: string[] };

export function buildSeed(
  content: SeedContent,
  placesFile: SeedPlaces,
  clock: { refDate: Date; demoNow: Date },
): BuildResult {
  const { refDate, demoNow } = clock;
  faker.seed(42);
  faker.setDefaultRefDate(refDate);
  const warnings: string[] = [];
  const t = Object.fromEntries(TABLE_ORDER.map((n) => [n, [] as Row[]])) as SeedTables;

  // people
  const people = content.people;
  const byHandle = new Map(people.map((p) => [p.handle, p]));
  const has = (h: string) => byHandle.has(h);
  const pid = (h: string) => profileId(h);
  const nameOf = (h: string) => byHandle.get(h)?.name.split(' ')[0] ?? h;
  const known = (hs: string[], where: string) => hs.filter((h) => {
    if (!has(h)) warnings.push(`${where}: unknown handle "${h}" skipped`);
    return has(h);
  });
  const homes = new Map<string, { lat: number; lng: number }>();
  for (const p of people) {
    const home = p.handle === 'alex'
      ? DEMO_CENTER
      : offsetPoint(DEMO_CENTER, faker.number.int({ min: 300, max: 2800 }), faker.number.int({ min: 0, max: 359 }));
    homes.set(p.handle, { lat: Number(home.lat.toFixed(6)), lng: Number(home.lng.toFixed(6)) });
  }
  const isLocal = (h: string) => byHandle.get(h)?.circles.some((c) => LOCAL_CIRCLES.includes(c)) ?? false;

  // friend graph
  const friendships = deriveFriendGraph(people.map((p) => ({ handle: p.handle, circles: p.circles })));
  const adj = friendAdjacency(friendships);
  const areFriends = (a: string, b: string) => adj.get(pid(a))?.has(pid(b)) ?? false;
  const handleById = new Map(people.map((p) => [pid(p.handle), p.handle]));
  const friendCreated = new Map<string, Date>();
  for (const f of friendships) {
    const created = f.status === 'accepted'
      ? faker.date.past({ years: 3, refDate: addMin(refDate, -7 * 24 * 60) })
      : faker.date.recent({ days: 4, refDate });
    friendCreated.set(`${f.userA}|${f.userB}`, created);
    t.friendships.push({
      user_a: f.userA, user_b: f.userB, requester_id: f.requesterId, status: f.status,
      created_at: iso(created), accepted_at: f.status === 'accepted' ? iso(created) : null,
    });
  }
  const alexFriends = people.map((p) => p.handle).filter((h) => h !== 'alex' && areFriends('alex', h));
  const personaRank = (h: string) => {
    const i = (PERSONA_HANDLES as readonly string[]).indexOf(h);
    return i < 0 ? 99 : i;
  };
  const byPersonaThenHandle = (a: string, b: string) => personaRank(a) - personaRank(b) || a.localeCompare(b);
  const alexLocalFriends = alexFriends.filter((h) => h !== 'maya' && isLocal(h)).sort(byPersonaThenHandle);

  // friend lists
  const closeFriendsId = (owner: string) => seedId('friend_list', `${owner}:close-friends`);
  const lists: Record<string, string[]> = {};
  if (has('alex')) {
    const college = alexFriends.filter((h) => h !== 'maya' && byHandle.get(h)!.circles.includes('college')).sort();
    lists.alex = [...(has('maya') ? ['maya'] : []), ...college.slice(0, 2)];
  }
  if (has('maya')) {
    const roommates = people.map((p) => p.handle)
      .filter((h) => h !== 'maya' && h !== 'alex' && areFriends('maya', h) && byHandle.get(h)!.circles.includes('maya-roommates'))
      .sort();
    lists.maya = [...(areFriends('maya', 'alex') ? ['alex'] : []), ...roommates.slice(0, 2)];
  }
  for (const [owner, members] of Object.entries(lists)) {
    const id = closeFriendsId(owner);
    t.friend_lists.push({ id, owner_id: pid(owner), name: 'Close friends', created_at: iso(addMin(refDate, -30 * 24 * 60)) });
    for (const m of members) t.friend_list_members.push({ list_id: id, user_id: pid(m), added_at: iso(addMin(refDate, -30 * 24 * 60)) });
  }

  // profiles
  for (const p of people) {
    const visibility = { ...DEFAULT_VISIBILITY };
    if (p.handle === 'alex' && lists.alex) visibility.hometown = `list:${closeFriendsId('alex')}`;
    if (p.handle === 'maya') visibility.job = 'friends';
    const home = homes.get(p.handle)!;
    t.profiles.push({
      id: pid(p.handle), handle: p.handle, name: p.name,
      avatar_url: p.avatar ?? `/seed/people/${p.handle}.webp`, cover_url: p.cover ?? null,
      bio: p.bio, interests: p.interests, budget_max: Math.round(p.budgetMax),
      home_lat: home.lat, home_lng: home.lng, is_demo_user: p.isDemoUser,
      school: p.school ?? null, major: p.major ?? null, grad_year: p.gradYear ?? null,
      hometown: p.hometown ?? null, current_city: p.currentCity ?? null, job: p.job ?? null,
      pronouns: p.pronouns ?? null, age: p.age ?? null,
      field_visibility: JSON.stringify(visibility),
      created_at: iso(faker.date.past({ years: 4, refDate: addMin(refDate, -60 * 24 * 60) })),
    });
  }

  // places
  const placeByName = new Map(placesFile.places.map((p) => [p.name, p]));
  const placeId = (name: string) => seedId('place', name);
  for (const p of placesFile.places) {
    t.places.push({
      id: placeId(p.name), name: p.name, category: p.category, address: p.address, description: p.description,
      lat: p.lat, lng: p.lng, price_level: p.priceLevel, typical_cost_usd: p.typicalCostUsd,
      hours: JSON.stringify(p.hours), created_at: iso(addMin(refDate, -365 * 24 * 60)),
    });
  }
  const requirePlace = (name: string) => {
    const p = placeByName.get(name);
    if (!p) throw new Error(`place "${name}" is not in supabase/seed-places.json`);
    return p;
  };

  // groups
  const groupBySlug = new Map(content.groups.map((g) => [g.slug, g]));
  const groupId = (slug: string) => seedId('group', slug);
  const groupMembers = new Map<string, string[]>();
  for (const g of content.groups) {
    const members = [...new Set(known(g.memberHandles, `group ${g.slug}`))];
    groupMembers.set(g.slug, members);
    t.groups.push({
      id: groupId(g.slug), slug: g.slug, name: g.name, privacy: g.privacy, description: g.description,
      tags: g.tags, cover_url: g.cover ?? null, created_by: members[0] ? pid(members[0]) : null,
      created_at: iso(faker.date.past({ years: 2, refDate: addMin(refDate, -90 * 24 * 60) })),
    });
    members.forEach((m, i) => t.group_members.push({
      group_id: groupId(g.slug), user_id: pid(m), role: i === 0 ? 'admin' : 'member',
      joined_at: iso(faker.date.past({ years: 1, refDate })),
    }));
  }

  // upcoming quests (the demo story)
  const nonSeatable = new Set(NEVER_PRESEATED);
  const everyone = people.map((p) => p.handle).sort();
  DEMO_QUESTS.forEach((q, qi) => {
    const place = requirePlace(q.placeName);
    const rng = mulberry32(1000 + qi);
    const fromGroup = q.groupSlug ? groupMembers.get(q.groupSlug) ?? [] : [];
    const order = [...new Set([
      ...q.preferredMembers.filter(has),
      ...shuffled(fromGroup, rng),
      ...shuffled(everyone.filter(isLocal), rng),
      ...shuffled(everyone, rng),
    ])].filter((h) => !nonSeatable.has(h));
    const members = order.slice(0, Math.min(q.memberCount, q.capacity));
    if (members.length < q.memberCount) warnings.push(`quest ${q.key}: only ${members.length}/${q.memberCount} members available`);
    if (members.length === 0) { warnings.push(`quest ${q.key}: no host available, skipped`); return; }
    const id = seedId('quest', q.key);
    const exact = { lat: place.lat, lng: place.lng };
    const approx = fuzzLocation(exact, id);
    const starts = addMin(demoNow, q.startsInMin);
    const hasGroup = q.groupSlug !== null && groupBySlug.has(q.groupSlug);
    if (q.groupSlug && !hasGroup) warnings.push(`quest ${q.key}: group ${q.groupSlug} missing, group_id null`);
    const visibility = q.visibility === 'group' && !hasGroup ? 'community' : q.visibility ?? 'community';
    t.quests.push({
      id, host_id: pid(members[0]), title: q.title, emoji: q.emoji, category: q.category,
      description: q.description, venue_name: place.name, place_id: placeId(place.name),
      group_id: hasGroup ? groupId(q.groupSlug!) : null,
      lat: exact.lat, lng: exact.lng, approx_lat: approx.lat, approx_lng: approx.lng,
      starts_at: iso(starts), ends_at: iso(addMin(starts, q.durationMin)),
      capacity: q.capacity, price_max: q.priceMax, tags: q.tags,
      status: members.length >= q.capacity ? 'full' : 'open',
      is_public: visibility === 'community', visibility, poster_url: null, bubble_text: q.bubbleText ?? null,
      // Over a day old, so seeded plans never count toward a host's daily posting cap (EVENTS_PER_DAY).
      created_at: iso(addMin(demoNow, -(25 * 60 + qi * 7))),
    });
    members.forEach((m, i) => t.quest_members.push({
      quest_id: id, user_id: pid(m), joined_at: iso(addMin(demoNow, -(50 - i * 5 + qi))), via_friend_id: null,
    }));
    members.slice(0, q.checkedIn ?? 0).forEach((m, i) => t.quest_checkins.push({
      quest_id: id, user_id: pid(m), checked_in_at: iso(addMin(demoNow, -(10 - i * 2))),
    }));
  });

  // availability
  for (const a of DEMO_AVAILABILITY) {
    const handle = a.handle ?? alexLocalFriends[a.friendSlot ?? 0];
    if (!handle || !has(handle)) { warnings.push(`availability "${a.text}": no person for slot`); continue; }
    const near = a.nearPlace ? requirePlace(a.nearPlace) : homes.get(handle)!;
    t.availability.push({
      id: seedId('availability', `${handle}:${a.text}`), user_id: pid(handle), text: a.text,
      starts_at: iso(addMin(demoNow, a.startsInMin)), ends_at: iso(addMin(demoNow, a.endsInMin)),
      lat: near.lat, lng: near.lng, intent: null, audience: 'friends',
      created_at: iso(addMin(demoNow, Math.min(a.startsInMin, 0) - 10)),
    });
  }

  // past hangouts: one a week for 6 weeks; the 3 most recent formed crews with memories
  const imagePool = content.posts.map((p) => p.image).filter((x): x is string => !!x).sort();
  const photo = (i: number) => imagePool.length ? imagePool[i % imagePool.length] : '/seed/posts/p001.webp';
  let photoIndex = 0;
  const localPool = [...alexLocalFriends, ...everyone.filter((h) => isLocal(h) && !alexLocalFriends.includes(h) && h !== 'alex' && h !== 'maya')];
  PAST_HANGOUTS.forEach((h, hi) => {
    if (!has('alex')) return;
    const place = requirePlace(h.placeName);
    const locals = localPool.slice(hi % Math.max(localPool.length, 1)).concat(localPool).filter((x) => !h.withHandles.includes(x));
    const members = [...new Set(['alex', ...h.withHandles.filter(has), ...locals.slice(0, h.extraLocals)])];
    const id = seedId('quest', h.key);
    const starts = addMin(floorToHour(demoNow), -h.daysAgo * 24 * 60);
    const ends = addMin(starts, h.durationMin);
    const exact = { lat: place.lat, lng: place.lng };
    const approx = fuzzLocation(exact, id);
    t.quests.push({
      id, host_id: pid(members[members.length > 1 ? 1 : 0]), title: h.title, emoji: h.emoji, category: h.category,
      description: '', venue_name: place.name, place_id: placeId(place.name), group_id: null,
      lat: exact.lat, lng: exact.lng, approx_lat: approx.lat, approx_lng: approx.lng,
      starts_at: iso(starts), ends_at: iso(ends), capacity: members.length + 1, price_max: h.priceMax,
      tags: h.tags, status: 'done', is_public: true, visibility: 'community', poster_url: null, bubble_text: null,
      created_at: iso(addMin(starts, -120)),
    });
    members.forEach((m) => t.quest_members.push({ quest_id: id, user_id: pid(m), joined_at: iso(addMin(starts, -60)), via_friend_id: null }));
    if (h.crew) {
      const crewId = seedId('crew', h.key);
      t.crews.push({
        id: crewId, name: h.crew.name, origin_quest_id: id, shared_prefs: h.crew.sharedPrefs,
        last_hangout_at: iso(ends), created_at: iso(ends),
      });
      members.forEach((m) => t.crew_members.push({ crew_id: crewId, user_id: pid(m) }));
      h.crew.captions.forEach((caption, ci) => t.memories.push({
        id: seedId('memory', `${h.key}:${ci}`), crew_id: crewId, quest_id: id,
        uploader_id: pid(members[ci % members.length]), photo_url: photo(photoIndex++), caption,
        created_at: iso(addMin(ends, -10 + ci)),
      }));
    }
  });

  // daily quests (today and the 6 days before, in DEMO_TZ) and a few of Alex's entries
  DAILY_PROMPTS.forEach((d, i) => {
    const date = demoDate(addMin(demoNow, -i * 24 * 60));
    t.daily_quests.push({ date, prompt: d.prompt, emoji: d.emoji });
    if (has('alex') && [1, 2, 4].includes(i)) {
      t.daily_entries.push({
        date, user_id: pid('alex'), photo_url: photo(photoIndex++), verified: true,
        muse_note: 'Looks like the prompt to me.', created_at: iso(addMin(demoNow, -i * 24 * 60 - 120)),
      });
    }
  });

  // events
  for (const e of content.events) {
    if (!has(e.hostHandle)) { warnings.push(`event ${e.slug}: unknown host, skipped`); continue; }
    const place = placeByName.get(e.placeName);
    if (!place) warnings.push(`event ${e.slug}: place "${e.placeName}" not in places, no location`);
    const id = seedId('event', e.slug);
    const starts = addMin(refDate, Math.round(e.startsInHours * 60));
    const hasGroup = !!e.groupSlug && groupBySlug.has(e.groupSlug);
    t.events.push({
      id, slug: e.slug, title: e.title, description: e.description,
      group_id: hasGroup ? groupId(e.groupSlug!) : null, host_id: pid(e.hostHandle),
      place_id: place ? placeId(place.name) : null, venue_name: e.placeName,
      lat: place?.lat ?? null, lng: place?.lng ?? null,
      starts_at: iso(starts), ends_at: iso(addMin(starts, Math.round(e.durationHours * 60))),
      price_usd: e.priceUsd, capacity: e.capacity ?? null, category: e.category, cover_url: e.cover ?? null,
      created_at: iso(faker.date.recent({ days: 10, refDate })),
    });
    const going = new Set([e.hostHandle, ...known(e.goingHandles, `event ${e.slug}`)]);
    const interested = known(e.interestedHandles, `event ${e.slug}`).filter((h) => !going.has(h));
    for (const h of going) t.event_rsvps.push({ event_id: id, user_id: pid(h), status: 'going', created_at: iso(faker.date.recent({ days: 5, refDate })) });
    for (const h of new Set(interested)) t.event_rsvps.push({ event_id: id, user_id: pid(h), status: 'interested', created_at: iso(faker.date.recent({ days: 5, refDate })) });
  }

  // posts, comments, reactions
  type Notif = { recipient: string; type: string; actor: string; objectType: string; objectId: string; text: string; at: Date };
  const notifs: Notif[] = [];
  const notifyFor = new Set<string>(PERSONA_HANDLES);
  content.posts.forEach((p, pi) => {
    if (!has(p.authorHandle)) { warnings.push(`post ${p.id}: unknown author, skipped`); return; }
    let targetType = 'profile';
    let targetId = pid(p.authorHandle);
    let group: string | null = null;
    if (p.target.type === 'group') {
      if (!groupBySlug.has(p.target.slug)) { warnings.push(`post ${p.id}: unknown group ${p.target.slug}, skipped`); return; }
      targetType = 'group'; targetId = groupId(p.target.slug); group = p.target.slug;
    }
    const audience = ['public', 'friends', 'only_me'].includes(p.audience) || p.audience.startsWith('list:') ? p.audience : 'friends';
    const postId = seedId('post', p.id);
    const created = addMin(refDate, -Math.round(p.hoursAgo * 60));
    t.posts.push({
      id: postId, author_id: pid(p.authorHandle), target_type: targetType, target_id: targetId,
      audience, text: p.text, media: p.image ? [p.image] : [], shared_post_id: null, created_at: iso(created),
    });
    const at = (minutesAfter: number) => minDate(addMin(created, minutesAfter), addMin(refDate, -1));
    p.comments.forEach((c, ci) => {
      if (!has(c.authorHandle)) { warnings.push(`post ${p.id} comment ${ci}: unknown author, skipped`); return; }
      const cid = seedId('comment', `${p.id}:${ci}`);
      const cAt = at(c.minutesAfter);
      t.comments.push({ id: cid, post_id: postId, author_id: pid(c.authorHandle), parent_id: null, text: c.text, created_at: iso(cAt) });
      if (c.authorHandle !== p.authorHandle && notifyFor.has(p.authorHandle)) {
        notifs.push({ recipient: p.authorHandle, type: 'comment', actor: c.authorHandle, objectType: 'post', objectId: postId,
          text: `${nameOf(c.authorHandle)} commented on your post.`, at: cAt });
      }
      c.replies.forEach((r, ri) => {
        if (!has(r.authorHandle)) { warnings.push(`post ${p.id} reply ${ci}.${ri}: unknown author, skipped`); return; }
        const rAt = at(Math.max(r.minutesAfter, c.minutesAfter + 1));
        t.comments.push({ id: seedId('comment', `${p.id}:${ci}:${ri}`), post_id: postId, author_id: pid(r.authorHandle), parent_id: cid, text: r.text, created_at: iso(rAt) });
        if (r.authorHandle !== c.authorHandle && notifyFor.has(c.authorHandle)) {
          notifs.push({ recipient: c.authorHandle, type: 'reply', actor: r.authorHandle, objectType: 'post', objectId: postId,
            text: `${nameOf(r.authorHandle)} replied to your comment.`, at: rAt });
        }
      });
    });
    // reaction rows from counts: friends of the author and group members first, then anyone
    const rng = mulberry32(5000 + pi);
    const close = everyone.filter((h) => h !== p.authorHandle && (areFriends(h, p.authorHandle) || (group !== null && groupMembers.get(group)!.includes(h))));
    const pool = [...shuffled(close, rng), ...shuffled(everyone.filter((h) => h !== p.authorHandle && !close.includes(h)), rng)];
    const reactors: string[] = [];
    let k = 0;
    for (const type of REACTION_TYPES) {
      const n = p.reactions[type] ?? 0;
      for (let i = 0; i < n && k < pool.length; i++, k++) {
        reactors.push(pool[k]);
        t.reactions.push({ post_id: postId, user_id: pid(pool[k]), type, created_at: iso(at(5 + Math.floor(rng() * Math.max(1, p.hoursAgo * 60 - 5)))) });
      }
    }
    if (reactors.length > 0 && notifyFor.has(p.authorHandle)) {
      const others = reactors.length - 1;
      notifs.push({ recipient: p.authorHandle, type: 'reaction', actor: reactors[0], objectType: 'post', objectId: postId,
        text: others > 0 ? `${nameOf(reactors[0])} and ${others} ${others === 1 ? 'other' : 'others'} reacted to your post.` : `${nameOf(reactors[0])} reacted to your post.`,
        at: at(30) });
    }
  });

  // friend-request notifications
  for (const f of friendships) {
    if (f.status !== 'pending') continue;
    const requester = handleById.get(f.requesterId)!;
    const recipient = handleById.get(f.requesterId === f.userA ? f.userB : f.userA)!;
    if (!notifyFor.has(recipient)) continue;
    notifs.push({ recipient, type: 'friend_request', actor: requester, objectType: 'profile', objectId: pid(requester),
      text: `${nameOf(requester)} sent you a friend request.`, at: friendCreated.get(`${f.userA}|${f.userB}`)! });
  }
  // Out Here notifications for Alex: friends' invites to plans (one a repeat of a past hangout) and a join
  const OUT_HERE_NOTIFS = [
    { type: 'quest_invite', actor: 'maya', quest: 'dumplings', minsAgo: 8, text: (n: string) => `${n} invited you to Dumplings before the rush at Dumpling Den.` },
    { type: 'quest_join', actor: 'kai', quest: 'bouldering', minsAgo: 20, text: (n: string) => `${n} joined Bouldering intro, a plan near you.` },
    { type: 'quest_invite', actor: 'zara', quest: 'board-games', minsAgo: 45, text: (n: string) => `${n} wants to do Board game night again and invited you.` },
  ];
  for (const n of OUT_HERE_NOTIFS) {
    const questId = seedId('quest', n.quest);
    if (!has('alex') || !has(n.actor) || !t.quests.some((q) => q.id === questId)) continue;
    notifs.push({
      recipient: 'alex', type: n.type, actor: n.actor, objectType: 'quest', objectId: questId,
      text: n.text(nameOf(n.actor)), at: addMin(demoNow, -n.minsAgo),
    });
  }
  const dayAgo = addMin(refDate, -24 * 60);
  notifs.sort((a, b) => a.at.getTime() - b.at.getTime()).forEach((n, i) => t.notifications.push({
    id: seedId('notification', `${n.recipient}:${n.type}:${n.objectId}:${n.actor}:${i}`),
    recipient_id: pid(n.recipient), type: n.type, actor_id: pid(n.actor), object_type: n.objectType,
    object_id: n.objectId, text: n.text, created_at: iso(n.at),
    read_at: n.at < dayAgo ? iso(addMin(n.at, 60)) : null,
  }));

  // stories
  content.stories.forEach((s, i) => {
    if (!has(s.authorHandle)) { warnings.push(`story ${i}: unknown author, skipped`); return; }
    const created = addMin(refDate, -Math.round(s.hoursAgo * 60));
    t.stories.push({
      id: seedId('story', `${i}:${s.authorHandle}`), author_id: pid(s.authorHandle), media_url: s.image,
      audience: 'friends', created_at: iso(created), expires_at: iso(addMin(created, 24 * 60)),
    });
  });

  // threads and messages
  for (const th of content.threads) {
    const members = [...new Set(known(th.memberHandles, `thread ${th.id}`))];
    if (members.length < 2) { warnings.push(`thread ${th.id}: fewer than 2 members, skipped`); continue; }
    const id = seedId('thread', th.id);
    const msgs = th.messages.filter((m) => members.includes(m.fromHandle))
      .map((m, i) => ({ ...m, i, at: addMin(refDate, -Math.round(m.minutesAgo)) }))
      .sort((a, b) => a.at.getTime() - b.at.getTime() || a.i - b.i);
    const first = msgs[0]?.at ?? addMin(refDate, -24 * 60);
    const last = msgs[msgs.length - 1]?.at ?? null;
    t.threads.push({
      id, name: th.name ?? null, is_group: !!th.name || members.length > 2,
      created_at: iso(addMin(first, -1)), last_message_at: last ? iso(last) : null,
    });
    for (const m of members) {
      const lastOwn = [...msgs].reverse().find((x) => x.fromHandle === m)?.at ?? addMin(first, -1);
      t.thread_members.push({ thread_id: id, user_id: pid(m), last_read_at: iso(lastOwn) });
    }
    for (const m of msgs) {
      t.messages.push({
        id: seedId('message', `${th.id}:${m.i}`), thread_id: id, from_id: pid(m.fromHandle), text: m.text,
        kind: 'text', invite_id: null, created_at: iso(m.at),
      });
    }
  }

  // listings
  for (const l of content.listings) {
    if (!has(l.sellerHandle)) { warnings.push(`listing ${l.id}: unknown seller, skipped`); continue; }
    const home = homes.get(l.sellerHandle)!;
    t.listings.push({
      id: seedId('listing', l.id), seller_id: pid(l.sellerHandle), title: l.title, price_usd: l.priceUsd,
      condition: l.condition, category: l.category, description: l.description, image_url: l.image ?? null,
      lat: home.lat, lng: home.lng, status: 'available',
      pickup_until: null, pickup_label: null, pickup_spot: null,
      created_at: iso(addMin(refDate, -Math.round(l.hoursAgo * 60))),
    });
  }

  // Marketplace pickup on the map: a few listings open for pickup now, placed around the demo
  // centre. None is a chair, so the chair a seller lists live is what Muse surfaces for Alex's want.
  for (const p of PICKUP_LISTINGS) {
    const row = t.listings.find((r) => r.id === seedId('listing', p.id));
    if (!row) { warnings.push(`pickup listing ${p.id}: not in seed content, skipped`); continue; }
    const at = offsetPoint(DEMO_CENTER, p.meters, p.bearing);
    Object.assign(row, {
      lat: at.lat, lng: at.lng, pickup_label: p.label, pickup_spot: p.spot,
      pickup_until: iso(addMin(demoNow, p.openMin)), created_at: iso(addMin(demoNow, -p.listedMinAgo)),
    });
  }
  if (has('alex')) {
    t.muse_wants.push({
      id: seedId('want', 'alex-desk-chair'), user_id: pid('alex'), text: ALEX_WANT.text, item: ALEX_WANT.item,
      keywords: ALEX_WANT.keywords, max_price: ALEX_WANT.maxPrice, max_drive_min: ALEX_WANT.maxDriveMin,
      active: true, created_at: iso(addMin(demoNow, -26 * 60)),
    });
  }

  // friend locations (Find My): times relative to demoNow, shares expire 4 h after seeding
  for (const s of SEED_LOCATION_SHARES) {
    if (!has(s.handle)) { warnings.push(`location share: unknown handle "${s.handle}" skipped`); continue; }
    let at: { lat: number; lng: number };
    if ('place' in s.at) {
      const place = requirePlace(s.at.place);
      at = s.at.offsetM ? offsetPoint(place, s.at.offsetM, s.at.bearingDeg ?? 0) : { lat: place.lat, lng: place.lng };
    } else at = s.at;
    t.location_shares.push({
      user_id: pid(s.handle), lat: Number(at.lat.toFixed(6)), lng: Number(at.lng.toFixed(6)),
      place_label: s.placeLabel, precision: s.precision, audience: s.audience ?? 'friends', paused: s.paused ?? false,
      emoji: s.bubble.emoji, thought: s.bubble.thought, doing: s.bubble.doing, wants_to: s.bubble.wantsTo,
      updated_at: iso(addMin(demoNow, -s.updatedMinAgo)),
      expires_at: iso(addMin(demoNow, s.expiresInMin ?? SHARE_TTL_MIN)),
    });
  }

  // Muse Intros settings (no intros: Muse makes them live)
  const offKind = { on: false, lookingFor: '' };
  for (const s of SEED_INTRO_PROFILES) {
    if (!has(s.handle)) { warnings.push(`intro profile: unknown handle "${s.handle}" skipped`); continue; }
    t.intro_profiles.push({
      user_id: pid(s.handle),
      kinds: JSON.stringify({
        friendship: s.kinds.friendship ?? offKind, networking: s.kinds.networking ?? offKind, dating: s.kinds.dating ?? offKind,
      }),
      dating_prefs: s.datingPrefs ? JSON.stringify(s.datingPrefs) : null,
      max_km: s.maxKm ?? 25, paused: s.paused ?? false,
    });
  }

  return { tables: t, warnings };
}

