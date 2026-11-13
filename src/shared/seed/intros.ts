// Seeded Intro settings for the Muse Intros demo. The seed script and the MemoryStore both
// build intro_profiles rows from this list. No intros are seeded: Muse makes them live.
//
// Demo story (checked against the seed friend graph in src/features/intros/rules.test.ts):
// - alex and jordan are not friends; both know maya and both are in Bay Area Local Shows.
//   Both love local bands, comics and zines, and both want friends for local shows, comic shops and
//   open houses (the comic open house story, comics.ts). As a coffee chat they also share
//   product/design: five distinct facts, so the mock agents score the networking intro 97. A
//   friendship-only round has three distinct facts (local bands, comics, zines) and scores 91.
// - tess (maya's roommate) and ava (cheap-eats group) are in alex's reach but share little:
//   Muse considers them and drops them below the bar (~55).
// - yuki shares one design fact (~67), still below the bar.
// - riley is dating-only and wants women or nonbinary people, so alex's dating request finds
//   nobody ("No great match yet").
import type { DatingPrefs, IntroKind, IntroKindSetting } from '../types';

export type SeedIntroProfile = {
  handle: string;
  kinds: Partial<Record<IntroKind, IntroKindSetting>>;
  datingPrefs?: DatingPrefs | null;
  maxKm?: number;
  paused?: boolean;
};

export const SEED_INTRO_PROFILES: SeedIntroProfile[] = [
  {
    handle: 'alex',
    kinds: {
      friendship: { on: true, lookingFor: 'people to go to local shows, comic shops and open houses with' },
      networking: { on: true, lookingFor: 'product/design coffee chats' },
    },
  },
  {
    handle: 'jordan',
    kinds: {
      friendship: { on: true, lookingFor: 'friends for local shows, gig nights, comic shops and open houses' },
      networking: { on: true, lookingFor: 'coffee chats with product people about design work' },
    },
  },
  { handle: 'maya', kinds: { friendship: { on: true, lookingFor: 'more friends in Redwood City' } } },
  { handle: 'tess', kinds: { friendship: { on: true, lookingFor: 'brunch buddies and pilates classes' } } },
  { handle: 'ava', kinds: { friendship: { on: true, lookingFor: 'a climbing partner for weeknights' } } },
  { handle: 'yuki', kinds: { networking: { on: true, lookingFor: 'illustration and design freelance clients' } } },
  {
    handle: 'riley',
    kinds: { dating: { on: true, lookingFor: 'someone to go to shows with' } },
    datingPrefs: { ageMin: 21, ageMax: 28, genders: ['woman', 'nonbinary'] },
  },
];
