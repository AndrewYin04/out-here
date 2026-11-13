// Seeded Intro settings for the Muse Intros demo. The seed script and the MemoryStore both
// build intro_profiles rows from this list. No intros are seeded: Muse makes them live.
//
// Demo story (checked against the seed friend graph in src/features/intros/rules.test.ts):
// - alex and jordan are not friends; both know maya and both are in Bay Area Local Shows.
//   Both love local bands, thrifting and vintage, and both want friends for local shows, thrift
//   runs and closet sales (the closet sale story, closet-sale.ts). A friendship round has four
//   distinct facts (local bands, thrifting, vintage, the shared want) and scores 97.
// - bea (thrift circle, trust path via Tyler) loves thrifting and vintage and wants thrift
//   buddies for closet sales: three facts, 91. She is the second choice for the closet sale.
// - grace (New Grads) likes thrifting only: one fact, ~67, considered and dropped below the bar.
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
      friendship: { on: true, lookingFor: 'people to go to local shows, thrift runs and closet sales with' },
      networking: { on: true, lookingFor: 'product/design coffee chats' },
    },
  },
  {
    handle: 'jordan',
    kinds: {
      friendship: { on: true, lookingFor: 'friends for local shows, gig nights, thrift runs and closet sales' },
      networking: { on: true, lookingFor: 'coffee chats with product people about design work' },
    },
  },
  { handle: 'maya', kinds: { friendship: { on: true, lookingFor: 'more friends in Redwood City' } } },
  { handle: 'bea', kinds: { friendship: { on: true, lookingFor: 'thrift buddies for flea markets and closet sales' } } },
  { handle: 'grace', kinds: { friendship: { on: true, lookingFor: 'volleyball people and weekend plans' } } },
  { handle: 'tess', kinds: { friendship: { on: true, lookingFor: 'brunch buddies and pilates classes' } } },
  { handle: 'ava', kinds: { friendship: { on: true, lookingFor: 'a climbing partner for weeknights' } } },
  { handle: 'yuki', kinds: { networking: { on: true, lookingFor: 'illustration and design freelance clients' } } },
  {
    handle: 'riley',
    kinds: { dating: { on: true, lookingFor: 'someone to go to shows with' } },
    datingPrefs: { ageMin: 21, ageMax: 28, genders: ['woman', 'nonbinary'] },
  },
];
