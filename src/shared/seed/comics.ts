// The comic open house story, seeded alongside the main demo story (story.ts).
//
// Theo Nakamura (new, a stranger to Alex and Jordan) sells a box of indie comics on
// Marketplace and posts it in Menlo Park New Grads, so it shows near the top of Alex's Feed.
// The listing names an Out Here plan: a free comics open house at Inkwell Comics Café, about
// 580 m from Alex (9 min at 80 m/min with the 1.3 route factor), starting 30 min after seeding.
// Before joining, the map shows the ~200 m fuzzed spot, which reads as a 7 min walk.
// Alex and Jordan both like comics, so a friendship intro round pairs them (trust path: Maya).
// Jordan also gets one past hangout (a zine swap with Sage), so their history is not empty.
//
// All titles, people and venues are fictional. The plan is linked to the listing by a
// `listing:<id>` tag until quests get a real listing link.
import { DEMO_QUESTS, PAST_HANGOUTS, type PastHangoutSpec, type QuestSpec } from './story';
import { seedId } from './ids';

export const COMIC_SELLER_HANDLE = 'theo';
/** Key in supabase/seed-content.json `listings`; the seed id is seedId('listing', key). */
export const COMIC_LISTING_KEY = 'l31';
export const COMIC_LISTING_ID = seedId('listing', COMIC_LISTING_KEY);
/** Key in supabase/seed-content.json `posts`. */
export const COMIC_POST_KEY = 'p301';
export const COMIC_QUEST_KEY = 'comics-open-house';
export const COMIC_VENUE = 'Inkwell Comics Café';
export const listingTag = (listingId: string) => `listing:${listingId}`;

export const COMIC_QUEST: QuestSpec = {
  key: COMIC_QUEST_KEY, title: 'Comics open house', emoji: '📚', category: 'art',
  description: 'Theo is clearing out his indie comics collection: Night Courier, small-press issues '
    + 'and a box of zines. Come flip through, trade recommendations, and take home whatever you like. '
    + 'Free to drop in.',
  placeName: COMIC_VENUE, startsInMin: 30, durationMin: 120, capacity: 8, memberCount: 3,
  priceMax: 0, tags: ['comics', 'indie comics', 'zines', 'small-press', 'open house', listingTag(COMIC_LISTING_ID)], groupSlug: null,
  preferredMembers: [COMIC_SELLER_HANDLE, 'sage', 'yuki'], hostHandle: COMIC_SELLER_HANDLE,
  visibility: 'community', bubbleText: 'bring a comic to trade 🔁',
};

/** Seeded plans beyond the main story. The seed and the Muse seed world build both lists. */
export const STORY_QUESTS: QuestSpec[] = [COMIC_QUEST];

/** Past hangouts for people other than Alex (not part of Alex's weekly streak). */
export const STORY_PAST_HANGOUTS: PastHangoutSpec[] = [
  {
    key: 'past-jordan-zines', title: 'Zine swap', emoji: '📖', category: 'art',
    placeName: 'El Camino Coffee Works', daysAgo: 9, durationMin: 90, priceMax: 6,
    tags: ['zines', 'comics', 'swap'], person: 'jordan', withHandles: ['sage'], extraLocals: 0,
    crew: {
      name: 'Zine swap crew', sharedPrefs: ['zines', 'comics', 'coffee'],
      captions: ['Left with more zines than we brought.'],
    },
    photos: ['/seed/events/coffee-works-zine-swap.webp'],
  },
];

/** Every seeded upcoming plan, in seed order (the main story first, so its ids and members never move). */
export const SEED_QUESTS: QuestSpec[] = [...DEMO_QUESTS, ...STORY_QUESTS];
/** Every seeded past hangout: Alex's weekly streak first, then the story's. */
export const SEED_PAST_HANGOUTS: PastHangoutSpec[] = [...PAST_HANGOUTS, ...STORY_PAST_HANGOUTS];
