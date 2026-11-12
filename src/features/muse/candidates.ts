// Step 2: candidate generation, pure code (no model). Decides which quests can actually
// happen for this person in this window: open, seats left, matches what they asked for,
// under budget, within the walking cap, reachable before the start (walking time included)
// and overlapping the window. Also works out which friends are free and could come.
import {
  MAX_WALK_MINUTES, walkingMinutes, walkingMinutesExact,
  type Availability, type ID, type LatLng, type MuseIntent, type Profile, type Quest,
} from '../../shared';
import { firstName, type PlanFriend } from './context';

export type CandidateInput = {
  intent: MuseIntent;
  viewer: Profile;
  friends: PlanFriend[];
  friendAvailability: Availability[];
  quests: Quest[];
  /** Viewer's starting point; callers default it to DEMO_CENTER. */
  location: LatLng;
  now: Date;
};

export type FriendFree = {
  friendId: ID;
  availabilityId: ID;
  firstName: string;
  availabilityText: string;
  freeFrom: string;
  freeUntil: string;
  /** Interests the friend shares with the viewer. */
  sharedWithViewer: string[];
};

export type FriendOverlap = FriendFree & {
  /** Friend interests that match this quest (tags, title or category). */
  sharedWithQuest: string[];
  /** Walking minutes from where the friend is to the quest. */
  travelMinutes: number;
};

export type PlanCandidate = {
  questId: ID;
  quest: Quest;
  travelMinutes: number;
  travelMinutesExact: number;
  /** Earliest arrival if the viewer leaves at the window start. */
  arriveAt: string;
  fitsWindow: boolean;
  underBudget: boolean;
  seatsLeft: number;
  /** Activities from the intent this quest matches. */
  matchedActivities: string[];
  /** True when a named activity (dish, sport, hobby) matched, not only "food". */
  specificMatch: boolean;
  /** Viewer interests that match this quest. */
  viewerInterests: string[];
  /** Friends free in the window who could make it and share an interest with the quest. */
  friendOverlap: FriendOverlap[];
  /** Viewer's friends already in the quest (public membership). */
  friendMembers: { friendId: ID; firstName: string }[];
};

export type DropReason =
  | 'not_open' | 'already_member' | 'full' | 'private' | 'activity' | 'budget' | 'walk' | 'window' | 'late'
  | 'small_group';
export type DroppedQuest = { questId: ID; title: string; reason: DropReason };

export type CandidateResult = { candidates: PlanCandidate[]; dropped: DroppedQuest[]; friendsFree: FriendFree[] };

// ---------- activity matching ----------

const FOOD_WORDS = new Set([
  'food', 'eat', 'eating', 'hungry', 'starving', 'lunch', 'dinner', 'brunch', 'breakfast', 'snack', 'snacks',
  'bite', 'meal', 'munch', 'grub',
]);
/** Named dishes and cuisines: when one is named, "food" alone no longer matches every food quest. */
const CUISINES = new Set([
  'dumpling', 'dumplings', 'ramen', 'pho', 'noodle', 'noodles', 'taco', 'tacos', 'sushi', 'boba', 'k-food', 'korean',
  'vietnamese', 'japanese', 'mexican', 'thai', 'chinese', 'indian', 'pizza', 'burger', 'burgers', 'bbq', 'dessert',
]);
/** Quest tags that make a non-food quest fine for a hungry person. */
const SNACK_TAGS = ['snack', 'drinks', 'boba'];
const GENERIC = new Set([
  'anything', 'something', 'hang', 'hang out', 'hangout', 'meet people', 'meet new people', 'people', 'social',
  'fun', 'plans', 'plan', 'friends', 'chill', 'free', 'whatever',
]);
const CATEGORY_ALIASES: Record<string, Quest['category'][]> = {
  music: ['music'], 'live music': ['music'], concert: ['music'], show: ['music'], band: ['music'], bands: ['music'],
  games: ['games'], gaming: ['games'], art: ['art'], study: ['study'], studying: ['study'],
  outdoors: ['outdoors'], outside: ['outdoors'], sports: ['sports'], sport: ['sports'],
  thrift: ['thrift'], thrifting: ['thrift'], food: ['food'],
};

const singular = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
const norm = (s: string) => s.toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean).map(singular).join(' ');

function phraseIn(phrase: string, hay: readonly string[]): boolean {
  const p = norm(phrase);
  if (!p) return false;
  return hay.some((h) => {
    const n = norm(h);
    return n === p || ` ${n} `.includes(` ${p} `);
  });
}

export function isFoodWord(a: string): boolean {
  return FOOD_WORDS.has(a.toLowerCase());
}

export function isFoodCompatible(q: Quest): boolean {
  return q.category === 'food' || q.tags.some((t) => SNACK_TAGS.includes(t.toLowerCase()));
}

/** Does one activity word match this quest? Generic words return null (no opinion). */
export function activityMatches(activity: string, q: Quest): boolean | null {
  const a = activity.trim().toLowerCase();
  if (!a || GENERIC.has(a)) return null;
  if (isFoodWord(a)) return isFoodCompatible(q);
  if (CATEGORY_ALIASES[a]?.includes(q.category)) return true;
  return phraseIn(a, [...q.tags, q.title, q.category]);
}

/** Interests from `interests` that match this quest. */
export function interestsMatchingQuest(interests: readonly string[], q: Quest): string[] {
  return interests.filter((i) => {
    if (CATEGORY_ALIASES[i.toLowerCase()]?.includes(q.category)) return true;
    return phraseIn(i, [...q.tags, q.title]);
  });
}

/**
 * Activities that filter quests: generic words dropped, and a bare food word dropped when a
 * dish or cuisine is named ("ramen" means ramen, not any food).
 */
export function effectiveActivities(activities: readonly string[]): string[] {
  const named = [...new Set(activities.map((a) => a.trim().toLowerCase()).filter((a) => a && !GENERIC.has(a)))];
  const hasCuisine = named.some((a) => CUISINES.has(a));
  return hasCuisine ? named.filter((a) => !isFoodWord(a)) : named;
}

// ---------- overlap helpers ----------

const ms = (iso: string) => Date.parse(iso);
const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && aEnd > bStart;

export function walkCap(intent: MuseIntent): number {
  return intent.maxWalkMinutes ?? MAX_WALK_MINUTES;
}

/** Friends whose shared availability overlaps the window. */
export function friendsFreeInWindow(input: Pick<CandidateInput, 'intent' | 'friends' | 'friendAvailability'>): FriendFree[] {
  const ws = ms(input.intent.windowStart);
  const we = ms(input.intent.windowEnd);
  const byId = new Map(input.friends.map((f) => [f.profile.id, f]));
  const out: FriendFree[] = [];
  for (const a of input.friendAvailability) {
    const f = byId.get(a.userId);
    if (!f || !overlaps(ms(a.startsAt), ms(a.endsAt), ws, we)) continue;
    out.push({
      friendId: f.profile.id, availabilityId: a.id, firstName: firstName(f.profile), availabilityText: a.text,
      freeFrom: a.startsAt, freeUntil: a.endsAt, sharedWithViewer: f.sharedInterests,
    });
  }
  return out;
}

// ---------- main ----------

export function buildCandidates(input: CandidateInput): CandidateResult {
  const { intent, viewer, quests, location, now } = input;
  const nowMs = now.getTime();
  const ws = Math.max(ms(intent.windowStart), nowMs);
  const we = ms(intent.windowEnd);
  const cap = walkCap(intent);
  const named = effectiveActivities(intent.activities);
  const friendIds = new Set(input.friends.map((f) => f.profile.id));
  const friendsFree = friendsFreeInWindow(input);
  const availabilityByFriend = new Map<ID, Availability[]>();
  for (const a of input.friendAvailability) {
    if (!friendIds.has(a.userId)) continue;
    availabilityByFriend.set(a.userId, [...(availabilityByFriend.get(a.userId) ?? []), a]);
  }

  const candidates: PlanCandidate[] = [];
  const dropped: DroppedQuest[] = [];
  const drop = (q: Quest, reason: DropReason) => dropped.push({ questId: q.id, title: q.title, reason });

  for (const q of quests) {
    if (q.status !== 'open') { drop(q, 'not_open'); continue; }
    if (q.memberIds.includes(viewer.id)) { drop(q, 'already_member'); continue; }
    const seatsLeft = q.capacity - q.memberIds.length;
    if (seatsLeft <= 0) { drop(q, 'full'); continue; }
    const friendMembers = q.memberIds
      .filter((id) => friendIds.has(id))
      .map((id) => {
        const f = input.friends.find((x) => x.profile.id === id)!;
        return { friendId: id, firstName: firstName(f.profile) };
      });
    if (!q.isPublic && friendMembers.length === 0) { drop(q, 'private'); continue; }
    if (friendMembers.length === 0 && q.capacity < 3) { drop(q, 'small_group'); continue; }

    const matchedActivities = named.filter((a) => activityMatches(a, q) === true);
    if (named.length > 0 && matchedActivities.length === 0) { drop(q, 'activity'); continue; }
    const underBudget = intent.budgetMax === null || q.priceMax <= intent.budgetMax;
    if (!underBudget) { drop(q, 'budget'); continue; }

    const travelMinutesExact = walkingMinutesExact(location, q.location);
    const travelMinutes = walkingMinutes(location, q.location);
    if (travelMinutesExact > cap) { drop(q, 'walk'); continue; }

    const qs = ms(q.startsAt);
    const qe = ms(q.endsAt);
    if (!overlaps(qs, qe, ws, we)) { drop(q, 'window'); continue; }
    const arrive = ws + travelMinutesExact * 60_000;
    if (arrive > qs) { drop(q, 'late'); continue; }

    const friendOverlap: FriendOverlap[] = [];
    for (const ff of friendsFree) {
      if (q.memberIds.includes(ff.friendId)) continue;
      const profile = input.friends.find((f) => f.profile.id === ff.friendId)!.profile;
      const sharedWithQuest = interestsMatchingQuest(profile.interests, q);
      if (sharedWithQuest.length === 0) continue;
      // the friend must be free at the start and able to walk there in time
      const avail = (availabilityByFriend.get(ff.friendId) ?? []).find((a) => a.id === ff.availabilityId);
      if (!avail) continue;
      const fTravel = walkingMinutesExact(avail.location, q.location);
      const depart = Math.max(nowMs, ms(avail.startsAt));
      if (ms(avail.endsAt) <= qs || depart + fTravel * 60_000 > qs || fTravel > MAX_WALK_MINUTES) continue;
      friendOverlap.push({ ...ff, sharedWithQuest, travelMinutes: Math.round(fTravel) });
    }

    candidates.push({
      questId: q.id, quest: q, travelMinutes, travelMinutesExact,
      arriveAt: new Date(arrive).toISOString(), fitsWindow: true, underBudget, seatsLeft,
      matchedActivities, specificMatch: matchedActivities.some((a) => !isFoodWord(a)),
      viewerInterests: interestsMatchingQuest(viewer.interests, q),
      friendOverlap, friendMembers,
    });
  }

  candidates.sort((a, b) => ms(a.quest.startsAt) - ms(b.quest.startsAt) || a.travelMinutesExact - b.travelMinutesExact);
  return { candidates, dropped, friendsFree };
}
