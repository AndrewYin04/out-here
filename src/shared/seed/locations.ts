// Seeded friend locations ("Find My" inside Facebook). Every local sharer that Alex can see is an
// accepted friend of Alex in the derived friend graph (maya, kai, ethan, zara, lena, liam, rosa;
// olivia is paused). Jordan, Nina and Priya also share, with their own friends only, and are not
// Alex's friends, so they never appear on Alex's map. Far-away pins are Alex's college and
// hometown friends. Times are minutes relative to the seed clock.
import type { Audience, LatLng, LocationPrecision, StatusBubble } from '../types';

export type SeedLocationShare = {
  handle: string;
  /** A place name from supabase/seed-places.json (optionally offset), or a fixed point. */
  at: { place: string; offsetM?: number; bearingDeg?: number } | LatLng;
  placeLabel: string;
  precision: LocationPrecision;
  audience?: Audience;
  paused?: boolean;
  bubble: StatusBubble;
  updatedMinAgo: number;
  /** Minutes from the seed clock until the share expires (negative = already expired). */
  expiresInMin?: number;
};

const b = (emoji: string, thought: string, doing: string | null, wantsTo: string | null): StatusBubble =>
  ({ emoji, thought, doing, wantsTo });

export const SEED_LOCATION_SHARES: SeedLocationShare[] = [
  // the viewer
  { handle: 'alex', at: { place: 'Hacker Way Courts', offsetM: 330, bearingDeg: 250 }, placeLabel: 'Hacker Way, Menlo Park',
    precision: 'exact', bubble: b('👋', 'new here, say hi', 'at work till 5', 'find people to grab food with'), updatedMinAgo: 6 },

  // local friends of Alex
  { handle: 'maya', at: { place: 'El Camino Coffee Works', offsetM: 40, bearingDeg: 120 }, placeLabel: 'El Camino Coffee Works',
    precision: 'exact', bubble: b('🥟', 'craving dumplings', 'lunch break for ~45 min', 'try Dumpling Den'), updatedMinAgo: 3 },
  { handle: 'kai', at: { place: 'Boulder Bay Gym' }, placeLabel: 'Boulder Bay Gym',
    precision: 'exact', bubble: b('🧗', 'chalked up', 'bouldering till 1', 'find a climbing buddy'), updatedMinAgo: 12 },
  { handle: 'ethan', at: { place: 'Dumpling Den', offsetM: 220, bearingDeg: 35 }, placeLabel: 'near Willow Rd',
    precision: 'exact', bubble: b('☕', 'need a second coffee', 'working from a cafe', 'walk somewhere after'), updatedMinAgo: 9 },
  { handle: 'zara', at: { place: 'Ravenswood Board Game Cafe', offsetM: 60, bearingDeg: 300 }, placeLabel: 'Ravenswood Board Game Cafe',
    precision: 'exact', bubble: b('🎲', 'board game brain', 'setting up for tonight', 'teach someone Wingspan'), updatedMinAgo: 18 },
  { handle: 'lena', at: { lat: 37.39335, lng: -122.07987 }, placeLabel: 'Mountain View',
    precision: 'approximate', bubble: b('🌮', 'taco tuesday energy', 'errands downtown', 'find a new taco spot'), updatedMinAgo: 25 },
  { handle: 'liam', at: { lat: 37.48521, lng: -122.23635 }, placeLabel: 'Redwood City',
    precision: 'approximate', bubble: b('🚲', 'biking home later', 'remote day', 'ride the Bay Trail'), updatedMinAgo: 34 },
  { handle: 'rosa', at: { lat: 37.46883, lng: -122.14102 }, placeLabel: 'East Palo Alto',
    precision: 'approximate', bubble: b('🎧', 'new playlist on repeat', 'heads down till 4', 'catch a local show'), updatedMinAgo: 41 },
  { handle: 'olivia', at: { lat: 37.44188, lng: -122.14302 }, placeLabel: 'Palo Alto',
    precision: 'exact', paused: true, bubble: b('📚', 'deadline mode', 'in meetings', null), updatedMinAgo: 70 },

  // far-away friends (college and hometown)
  { handle: 'kayla', at: { lat: 37.77493, lng: -122.41942 }, placeLabel: 'San Francisco, CA',
    precision: 'exact', bubble: b('🌁', 'in the city for the weekend', 'at a coffee shop in the Mission', 'meet up Saturday'), updatedMinAgo: 15 },
  { handle: 'sofia', at: { lat: 34.05223, lng: -118.24368 }, placeLabel: 'Los Angeles, CA',
    precision: 'exact', bubble: b('🌴', 'sunny again', 'at the studio', 'visit the Bay soon'), updatedMinAgo: 22 },
  { handle: 'tariq', at: { lat: 32.71574, lng: -117.16109 }, placeLabel: 'San Diego, CA',
    precision: 'exact', bubble: b('🏄', 'surf was flat', 'working till 6', 'plan a reunion trip'), updatedMinAgo: 48 },
  { handle: 'devon', at: { lat: 47.60621, lng: -122.33207 }, placeLabel: 'Seattle, WA',
    precision: 'exact', bubble: b('🌧️', 'rain, as promised', 'at the office', 'find a good ramen place'), updatedMinAgo: 31 },
  { handle: 'hannah', at: { lat: 45.51523, lng: -122.67838 }, placeLabel: 'Portland, OR',
    precision: 'exact', bubble: b('🍩', 'donut run', 'grad school reading', 'go hiking this weekend'), updatedMinAgo: 55 },
  { handle: 'emily', at: { lat: 30.26715, lng: -97.74306 }, placeLabel: 'Austin, TX',
    precision: 'exact', bubble: b('🎸', 'live music tonight', 'at work', 'see a show on Red River'), updatedMinAgo: 27 },
  { handle: 'ben', at: { lat: 40.71278, lng: -74.00597 }, placeLabel: 'New York, NY',
    precision: 'exact', bubble: b('🍕', 'dollar slice dinner', 'on the subway', 'visit SF in December'), updatedMinAgo: 8 },
  { handle: 'chloe', at: { lat: 39.73924, lng: -104.99025 }, placeLabel: 'Denver, CO',
    precision: 'exact', bubble: b('🏔️', 'first snow!', 'working from home', 'ski trip in January'), updatedMinAgo: 63 },
  { handle: 'aisha', at: { lat: 44.97775, lng: -93.26501 }, placeLabel: 'Minneapolis, MN',
    precision: 'exact', bubble: b('🧣', 'it is cold already', 'in the lab', 'call the college group'), updatedMinAgo: 90 },
  { handle: 'jess', at: { lat: 38.58157, lng: -121.4944 }, placeLabel: 'Sacramento, CA',
    precision: 'exact', bubble: b('🐶', 'walking the dog', 'off today', 'catch up over the holidays'), updatedMinAgo: 14 },
  { handle: 'andre', at: { lat: 38.57524, lng: -121.47836 }, placeLabel: 'Sacramento, CA',
    precision: 'exact', bubble: b('🏀', 'pickup at 6', 'at work', 'find a run in the Bay'), updatedMinAgo: 37 },
  { handle: 'tyler', at: { lat: 38.56081, lng: -121.42417 }, placeLabel: 'Sacramento, CA',
    precision: 'exact', bubble: b('🎮', 'new game came out', 'on lunch', 'play online tonight'), updatedMinAgo: 44 },
  { handle: 'josh', at: { lat: 38.59418, lng: -121.36773 }, placeLabel: 'Sacramento, CA',
    precision: 'exact', bubble: b('🍔', 'burger craving', 'driving home', null), updatedMinAgo: 52 },
  { handle: 'diego', at: { lat: 38.64045, lng: -121.47952 }, placeLabel: 'Sacramento, CA',
    precision: 'exact', bubble: b('⚽', 'watching the match', 'at home', 'visit the Bay next month'), updatedMinAgo: 66 },
  { handle: 'mia', at: { lat: 39.52963, lng: -119.8138 }, placeLabel: 'Reno, NV',
    precision: 'exact', bubble: b('❄️', 'chains on the tires', 'at work', 'Tahoe trip soon'), updatedMinAgo: 80 },
  // expired: hidden everywhere
  { handle: 'nate', at: { lat: 38.54491, lng: -121.74052 }, placeLabel: 'Davis, CA',
    precision: 'exact', bubble: b('🚗', 'road trip', 'driving', null), updatedMinAgo: 300, expiresInMin: -60 },

  // sharers who are NOT Alex's friends (they share with their own friends)
  { handle: 'jordan', at: { place: 'The Signal Room', offsetM: 50, bearingDeg: 10 }, placeLabel: 'The Signal Room',
    precision: 'exact', bubble: b('🎸', 'soundcheck soon', 'loading in gear', 'grab food before the show'), updatedMinAgo: 11 },
  { handle: 'nina', at: { place: 'Dumpling Den', offsetM: 90, bearingDeg: 200 }, placeLabel: 'near Willow Rd',
    precision: 'exact', bubble: b('🥟', 'dumplings again', 'meeting a friend', null), updatedMinAgo: 7 },
  { handle: 'priya', at: { lat: 37.42752, lng: -122.16972 }, placeLabel: 'Stanford',
    precision: 'exact', bubble: b('🧪', 'lab day', 'running experiments', 'study sprint later'), updatedMinAgo: 20 },
];

/** Default share lifetime: 4 hours from the last update. */
export const SHARE_TTL_MIN = 4 * 60;
