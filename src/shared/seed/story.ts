// The Out Here demo story as data: quests, friend availability, past hangouts and daily
// prompts, with times as minute offsets from "now". The seed script and the MemoryStore
// both build rows from these specs, so the demo behaves the same on either store.
//
// Alex's "hungry, got like 40 min, under $15" sees exactly three food quests starting
// inside the window: Dumpling Den (fits: ~9 min walk, $12, 2 seats left), Noodle Theory
// (~28 min walk, over the 25 min cap) and Kaiten Bay ($26, over budget). With 15 minutes,
// only the Bobalicious Corner boba quest (~4 min walk, $7, starts in 10) fits.
import type { QuestCategory, QuestVisibility } from '../types';

export type QuestSpec = {
  key: string;                 // stable key for the seed id
  title: string;
  emoji: string;
  category: QuestCategory;
  description: string;
  placeName: string;           // must exist in supabase/seed-places.json
  startsInMin: number;
  durationMin: number;
  capacity: number;
  memberCount: number;         // seeded members, host included
  priceMax: number;
  tags: string[];
  groupSlug: string | null;
  /** Hosts/members tried first, in order; the rest come from the group, then anyone. */
  preferredMembers: string[];
  /** Who can see it; default 'community'. 'group' needs groupSlug. */
  visibility?: QuestVisibility;
  /** Pop-up text bubble shown above the pin. */
  bubbleText?: string;
  /** Seeded members already checked in (the first N members), for a plan that is live now. */
  checkedIn?: number;
};

/** People never pre-seated in upcoming quests: the demo driver joins live, Maya via invite. */
export const NEVER_PRESEATED = ['alex', 'maya'];

export const DEMO_QUESTS: QuestSpec[] = [
  {
    key: 'dumplings', title: 'Dumplings before the rush', emoji: '🥟', category: 'food',
    description: 'Splitting a few plates of pork and chive dumplings at the counter. Cheap, fast, good.',
    placeName: 'Dumpling Den', startsInMin: 25, durationMin: 60, capacity: 4, memberCount: 2,
    priceMax: 12, tags: ['dumplings', 'cheap eats', 'chill'], groupSlug: 'cheap-eats-south-bay',
    preferredMembers: ['kai', 'nina'],
  },
  {
    key: 'ramen', title: 'Ramen run', emoji: '🍜', category: 'food',
    description: 'Tonkotsu at Noodle Theory, then maybe a walk. Long-ish walk from campus.',
    placeName: 'Noodle Theory', startsInMin: 20, durationMin: 60, capacity: 4, memberCount: 2,
    priceMax: 14, tags: ['ramen', 'noodles'], groupSlug: null,
    preferredMembers: ['leo'],
  },
  {
    key: 'sushi', title: 'Conveyor sushi lunch', emoji: '🍣', category: 'food',
    description: 'Grabbing plates off the belt at Kaiten Bay. It adds up, budget around $26.',
    placeName: 'Kaiten Bay', startsInMin: 30, durationMin: 75, capacity: 4, memberCount: 1,
    priceMax: 26, tags: ['sushi', 'japanese'], groupSlug: null,
    preferredMembers: ['priya'],
  },
  {
    key: 'boba', title: 'Boba + sketching', emoji: '🧋', category: 'art',
    description: 'Bring a pen, grab a boba, draw whatever is on the table. No skill needed.',
    placeName: 'Bobalicious Corner', startsInMin: 10, durationMin: 60, capacity: 6, memberCount: 3,
    priceMax: 7, tags: ['boba', 'drinks', 'snack', 'sketching'], groupSlug: 'boba-and-sketch',
    preferredMembers: ['nina'],
  },
  {
    key: 'volleyball', title: 'Pickup volleyball, need 1', emoji: '🏐', category: 'sports',
    description: 'We have 7, need one more for 4v4 on the sand courts. All levels.',
    placeName: 'Hacker Way Courts', startsInMin: 15, durationMin: 90, capacity: 8, memberCount: 7,
    priceMax: 0, tags: ['volleyball', 'pickup', 'outdoors'], groupSlug: 'pickup-volleyball-peninsula',
    preferredMembers: ['sam'],
  },
  {
    key: 'thrift', title: 'Thrift walk on Willow', emoji: '🧥', category: 'thrift',
    description: 'Digging through the $5 bins at Willow Thrift Co., then wherever looks good.',
    placeName: 'Willow Thrift Co.', startsInMin: 90, durationMin: 120, capacity: 5, memberCount: 2,
    priceMax: 15, tags: ['thrifting', 'vintage'], groupSlug: 'peninsula-thrift-walks',
    preferredMembers: ['jordan'],
  },
  {
    key: 'study', title: 'Silent study sprint', emoji: '📚', category: 'study',
    description: 'Two 40-minute focus blocks with a snack break. Phones face down.',
    placeName: 'Belle Haven Library Study Room', startsInMin: 45, durationMin: 90, capacity: 6, memberCount: 3,
    priceMax: 0, tags: ['study', 'focus', 'quiet'], groupSlug: 'stanford-grad-socials',
    preferredMembers: ['priya'],
  },
  {
    key: 'band-pregame', title: 'Local-band show pregame', emoji: '🎸', category: 'music',
    description: 'Meeting on the patio before tonight’s local lineup at The Signal Room.',
    placeName: 'The Signal Room', startsInMin: 240, durationMin: 90, capacity: 6, memberCount: 3,
    priceMax: 15, tags: ['local bands', 'indie music', 'live music'], groupSlug: 'bay-area-local-shows',
    preferredMembers: ['jordan'],
  },
  {
    key: 'art-walk', title: 'Art walk at Gallery 1600', emoji: '🖼️', category: 'art',
    description: 'New local show just went up. Slow loop, then coffee if people want.',
    placeName: 'Gallery 1600', startsInMin: 120, durationMin: 90, capacity: 8, memberCount: 3,
    priceMax: 0, tags: ['art', 'gallery'], groupSlug: null,
    preferredMembers: ['nina'],
  },
  {
    key: 'board-games', title: 'Board game night', emoji: '🎲', category: 'games',
    description: 'Wingspan, then something chaotic. $8 table fee covers the shelf.',
    placeName: 'Ravenswood Board Game Cafe', startsInMin: 180, durationMin: 150, capacity: 6, memberCount: 4,
    priceMax: 8, tags: ['board games', 'games'], groupSlug: 'peninsula-board-game-night',
    preferredMembers: ['leo'],
  },
  {
    key: 'sunset-walk', title: 'Bayfront Park sunset walk', emoji: '🌅', category: 'outdoors',
    description: 'Up to the overlook for sunset, easy pace, back before dark.',
    placeName: 'Bayfront Park Overlook', startsInMin: 300, durationMin: 60, capacity: 10, memberCount: 4,
    priceMax: 0, tags: ['walk', 'sunset', 'outdoors'], groupSlug: 'sunset-runners-bayfront',
    preferredMembers: ['sam'],
  },
  {
    key: 'pho', title: 'Pho run', emoji: '🍜', category: 'food',
    description: 'Big bowls at Pho Saigon Willow. Get the brisket.',
    placeName: 'Pho Saigon Willow', startsInMin: 150, durationMin: 60, capacity: 4, memberCount: 2,
    priceMax: 13, tags: ['pho', 'vietnamese', 'cheap eats'], groupSlug: null,
    preferredMembers: ['kai'],
  },
  {
    key: 'film-walk', title: 'Film photo walk', emoji: '📸', category: 'art',
    description: 'Shoot a roll around Belle Haven and drop it at Menlo Film Lab after.',
    placeName: 'Menlo Film Lab', startsInMin: 210, durationMin: 120, capacity: 6, memberCount: 2,
    priceMax: 12, tags: ['film photography', 'photo walk'], groupSlug: 'film-photo-walks-bay',
    preferredMembers: ['leo'],
  },
  {
    key: 'bouldering', title: 'Bouldering intro', emoji: '🧗', category: 'sports',
    description: 'First-timer friendly. We stay on the intro wall and teach the basics.',
    placeName: 'Boulder Bay Gym', startsInMin: 100, durationMin: 90, capacity: 5, memberCount: 2,
    priceMax: 22, tags: ['climbing', 'bouldering'], groupSlug: 'boulder-buddies-bay',
    preferredMembers: ['kai'],
  },
  {
    key: 'tacos', title: 'Taco truck crawl', emoji: '🌮', category: 'food',
    description: 'One taco from each of the three trucks on Willow Rd. Ranking required.',
    placeName: 'Taco Trucks on Willow Rd', startsInMin: 240, durationMin: 90, capacity: 6, memberCount: 3,
    priceMax: 10, tags: ['tacos', 'cheap eats'], groupSlug: 'cheap-eats-south-bay',
    preferredMembers: ['sam'],
  },
  {
    key: 'smash', title: 'Smash night', emoji: '🎮', category: 'games',
    description: 'Bracket on the big screen at Pixel Arcade. Bring your own controller if you have one.',
    placeName: 'Pixel Arcade', startsInMin: 270, durationMin: 180, capacity: 8, memberCount: 4,
    priceMax: 10, tags: ['video games', 'smash'], groupSlug: null,
    preferredMembers: ['jordan'],
  },
  {
    key: '5k', title: 'Easy 5K along the bay trail', emoji: '🏃', category: 'outdoors',
    description: 'Conversation pace on the flat trail. Nobody gets left behind.',
    placeName: 'Bay Trail Start (Bayfront)', startsInMin: 60, durationMin: 45, capacity: 10, memberCount: 3,
    priceMax: 0, tags: ['running', 'outdoors'], groupSlug: 'sunset-runners-bayfront',
    preferredMembers: ['sam'],
  },
  {
    // Group-only and already live: Alex (a member) sees it, Maya (not a member) does not.
    key: 'new-grads-frisbee', title: 'New grads frisbee on the lawn', emoji: '🥏', category: 'sports',
    description: 'Casual ultimate on the grass by the trail. Teams get picked on the spot, all levels.',
    placeName: 'Bay Trail Start (Bayfront)', startsInMin: -20, durationMin: 90, capacity: 10, memberCount: 6,
    priceMax: 0, tags: ['frisbee', 'new grads', 'outdoors'], groupSlug: 'menlo-park-new-grads',
    preferredMembers: ['sam'], visibility: 'group', bubbleText: 'We brought extra discs 🥏', checkedIn: 4,
  },
];

export type AvailabilitySpec = {
  handle: string | null;       // null = the n-th local friend of Alex (see friendSlot)
  friendSlot?: number;
  text: string;
  startsInMin: number;
  endsInMin: number;
  /** Where they are: a place name from seed-places.json, or null for their home. */
  nearPlace: string | null;
};

export const DEMO_AVAILABILITY: AvailabilitySpec[] = [
  { handle: 'maya', text: 'free after class, down for boba', startsInMin: 0, endsInMin: 50, nearPlace: 'El Camino Coffee Works' },
  { handle: null, friendSlot: 0, text: 'down for boba or a walk later', startsInMin: 60, endsInMin: 180, nearPlace: 'Gallery 1600' },
  { handle: null, friendSlot: 1, text: 'board games tonight?', startsInMin: 150, endsInMin: 300, nearPlace: 'Ravenswood Board Game Cafe' },
  { handle: null, friendSlot: 2, text: 'working from the coffee place, can take a food break', startsInMin: -30, endsInMin: 90, nearPlace: 'El Camino Coffee Works' },
];

export type PastHangoutSpec = {
  key: string;
  title: string;
  emoji: string;
  category: QuestCategory;
  placeName: string;
  daysAgo: number;
  durationMin: number;
  priceMax: number;
  tags: string[];
  /** Alex plus these handles (missing handles are skipped; locals are filled in). */
  withHandles: string[];
  extraLocals: number;
  crew: { name: string; sharedPrefs: string[]; captions: string[] } | null;
};

/** One hangout a week for the last 6 weeks: the weekly streak. The 3 most recent formed crews. */
export const PAST_HANGOUTS: PastHangoutSpec[] = [
  {
    key: 'past-dumplings', title: 'Dumpling Den first try', emoji: '🥟', category: 'food',
    placeName: 'Dumpling Den', daysAgo: 4, durationMin: 60, priceMax: 12,
    tags: ['dumplings', 'cheap eats'], withHandles: ['maya'], extraLocals: 2,
    crew: {
      name: 'Dumpling Den crew', sharedPrefs: ['dumplings', 'cheap eats', 'weeknights'],
      captions: ['Twelve dumplings each, no regrets.', 'Chili oil was a mistake. A good one.'],
    },
  },
  {
    key: 'past-show', title: 'Local band night', emoji: '🎸', category: 'music',
    placeName: 'The Signal Room', daysAgo: 11, durationMin: 150, priceMax: 15,
    tags: ['local bands', 'live music'], withHandles: ['maya'], extraLocals: 1,
    crew: {
      name: 'Signal Room regulars', sharedPrefs: ['local bands', 'late nights'],
      captions: ['Front row for the opener nobody knew yet.'],
    },
  },
  {
    key: 'past-sunset', title: 'Bayfront sunset walk', emoji: '🌅', category: 'outdoors',
    placeName: 'Bayfront Park Overlook', daysAgo: 18, durationMin: 60, priceMax: 0,
    tags: ['walk', 'sunset'], withHandles: [], extraLocals: 2,
    crew: {
      name: 'Sunset walkers', sharedPrefs: ['walks', 'sunsets', 'low-key'],
      captions: ['Made it up before the sun dropped.'],
    },
  },
  {
    key: 'past-boba', title: 'Boba + sketching', emoji: '🧋', category: 'art',
    placeName: 'Bobalicious Corner', daysAgo: 25, durationMin: 60, priceMax: 7,
    tags: ['boba', 'sketching'], withHandles: [], extraLocals: 2, crew: null,
  },
  {
    key: 'past-games', title: 'Board game night', emoji: '🎲', category: 'games',
    placeName: 'Ravenswood Board Game Cafe', daysAgo: 32, durationMin: 150, priceMax: 8,
    tags: ['board games'], withHandles: [], extraLocals: 3, crew: null,
  },
  {
    key: 'past-pho', title: 'Pho run', emoji: '🍜', category: 'food',
    placeName: 'Pho Saigon Willow', daysAgo: 39, durationMin: 60, priceMax: 13,
    tags: ['pho', 'cheap eats'], withHandles: [], extraLocals: 1, crew: null,
  },
];

export const DAILY_PROMPTS: { prompt: string; emoji: string }[] = [
  { prompt: 'Eat something you have never tried, with someone.', emoji: '🥢' },
  { prompt: 'Catch a sunset with a friend.', emoji: '🌅' },
  { prompt: 'Find the best $5 thing within a 10 minute walk.', emoji: '🪙' },
  { prompt: 'Take a photo of a band, a busker, or anyone making music.', emoji: '🎶' },
  { prompt: 'Play a game with someone you met this month.', emoji: '🎲' },
  { prompt: 'Walk somewhere new and take a photo together at the end.', emoji: '🚶' },
  { prompt: 'Share a snack with a coworker you have not talked to yet.', emoji: '🍪' },
];
