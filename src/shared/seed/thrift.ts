// The thrift story: a closet sale, seeded alongside the main demo story (story.ts).
//
// Leah Moreno (a recent grad moving to Seattle; a stranger to Alex and Jordan) clears out her
// closet: vintage denim jackets, band tees and sneakers at $5-25 each. She lists it on
// Marketplace as a pickup (PR #58: pickup_until, pickup_label, pickup_spot) and posts it in Menlo
// Park New Grads, so it shows near the top of Alex's Feed. The listing names an Out Here plan,
// "🧥 Closet sale + try-ons", in the courtyard of Willow Court Apartments in Belle Haven, about
// 580 m from Alex, starting 30 min after seeding.
//
// Location works like a Marketplace pickup (Andrew's rule): the map and the plan page show only
// the general area (approxLocation, ~200 m fuzz, and THRIFT_AREA) until the viewer is confirmed.
// Joining the plan, or Leah accepting a hold on the listing, confirms them; then Muse posts the
// exact spot (THRIFT_MEET_SPOT) in a ✨ Muse Messenger message and the pin switches to exact.
//
// Alex and Jordan both like thrifting, vintage and local bands (band tees tie them), so a
// friendship or plan-anchored intro pairs them (trust path: Maya). Bea and Grace are two more
// thrifters in Alex's reach who are free near the sale (story.ts DEMO_AVAILABILITY), so the ask
// "someone into thrifting to go with" offers three choices that all clear the 85 bar, Jordan first.
// Jordan's past hangout is a thrift walk with Bea.
//
// All people, venues and items are fictional; no brand names. The plan is linked to the listing
// by a `listing:<id>` tag (PR #58 has no plan link).
import { DEMO_QUESTS, PAST_HANGOUTS, type PastHangoutSpec, type QuestSpec } from './story';
import { seedId } from './ids';

export const THRIFT_SELLER_HANDLE = 'leah';
/** Key in supabase/seed-content.json `listings`; the seed id is seedId('listing', key). */
export const THRIFT_LISTING_KEY = 'l31';
export const THRIFT_LISTING_ID = seedId('listing', THRIFT_LISTING_KEY);
/** Keys in supabase/seed-content.json `posts`: Leah's sale post and Jordan's thrift-walk post. */
export const THRIFT_POST_KEY = 'p301';
export const THRIFT_JORDAN_POST_KEY = 'p302';
/** Story posts nobody in the demo has reacted to yet, so Alex's Like on stage is his own. */
export const STORY_POST_KEYS: readonly string[] = [THRIFT_POST_KEY, THRIFT_JORDAN_POST_KEY];
/** The demo drivers never appear as seeded reactors on story posts. */
export const STORY_NO_REACT: readonly string[] = ['alex', 'jordan'];
export const THRIFT_QUEST_KEY = 'closet-sale';
export const THRIFT_QUEST_ID = seedId('quest', THRIFT_QUEST_KEY);
export const THRIFT_VENUE = 'Willow Court Apartments';
/** The general area everyone sees before they are confirmed (and on the Marketplace pickup pin). */
export const THRIFT_AREA = 'Belle Haven, near Ivy Dr';
/** The exact spot: for people on the plan, and a buyer whose hold Leah accepted. */
export const THRIFT_MEET_SPOT = 'Courtyard by the bike racks, Willow Court Apartments';
export const listingTag = (listingId: string) => `listing:${listingId}`;

export const THRIFT_QUEST: QuestSpec = {
  key: THRIFT_QUEST_KEY, title: 'Closet sale + try-ons', emoji: '🧥', category: 'thrift',
  description: 'Leah is moving to Seattle and clearing out her closet: vintage denim jackets, band tees and '
    + 'sneakers, $5-25 each. Free to come by and try things on. The map shows the area; Muse shares '
    + 'the exact spot once you join.',
  placeName: THRIFT_VENUE, startsInMin: 30, durationMin: 120, capacity: 8, memberCount: 3,
  priceMax: 0, tags: ['thrifting', 'vintage', 'closet sale', 'try-on', 'denim', 'band tees', listingTag(THRIFT_LISTING_ID)], groupSlug: null,
  preferredMembers: [THRIFT_SELLER_HANDLE, 'june', 'sage'], hostHandle: THRIFT_SELLER_HANDLE,
  visibility: 'community', bubbleText: 'try stuff on 🧥', meetSpot: THRIFT_MEET_SPOT, areaLabel: THRIFT_AREA,
};

/** Seeded plans beyond the main story. The seed and the Muse seed world build both lists. */
export const STORY_QUESTS: QuestSpec[] = [THRIFT_QUEST];

/** Past hangouts for people other than Alex (not part of Alex's weekly streak). */
export const STORY_PAST_HANGOUTS: PastHangoutSpec[] = [
  {
    key: 'past-jordan-thrift-walk', title: 'Thrift walk', emoji: '🧥', category: 'thrift',
    placeName: 'Willow Thrift Co.', daysAgo: 9, durationMin: 90, priceMax: 15,
    tags: ['thrifting', 'vintage', 'band tees'], person: 'jordan', withHandles: ['bea'], extraLocals: 0,
    crew: {
      name: 'Thrift walk crew', sharedPrefs: ['thrifting', 'vintage', 'band tees'],
      captions: ['Two band tees and one corduroy jacket later.'],
    },
    photos: ['/seed/events/willow-thrift-walk.webp'],
  },
];

/** Every seeded upcoming plan, in seed order (the main story first, so its ids and members never move). */
export const SEED_QUESTS: QuestSpec[] = [...DEMO_QUESTS, ...STORY_QUESTS];
/** Every seeded past hangout: Alex's weekly streak first, then the story's. */
export const SEED_PAST_HANGOUTS: PastHangoutSpec[] = [...PAST_HANGOUTS, ...STORY_PAST_HANGOUTS];

/** Seeded plans' exact meeting spots and general areas, by quest id. */
export const SEED_MEET_SPOTS: ReadonlyMap<string, { meetSpot: string; areaLabel: string | null }> = new Map(
  SEED_QUESTS.filter((q) => q.meetSpot).map((q) => [seedId('quest', q.key), { meetSpot: q.meetSpot!, areaLabel: q.areaLabel ?? null }]),
);
