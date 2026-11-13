// Client-safe types for the Muse Intros plan step (the part after both people said yes).
import type { ID, IntroCardView } from '@/shared';

/** Another upcoming plan the pair can switch to ("Pick another time"). */
export type IntroPlanOption = { questId: ID; label: string; when: string; seatsLeft: number };

/**
 * Muse's open question in a connected intro: hold seats at the first step, or pick another plan.
 * `held` is true once both people are on the quest's member list.
 */
export type IntroPlanView = {
  questId: ID | null;
  /** "Want me to hold 2 seats at 🎸 Local-band show pregame, Today 7:50 PM?" */
  ask: string;
  held: boolean;
  /** Seats still needed for the two of them (0 when held). */
  seatsNeeded: number;
  /** True when the quest has enough open seats for everyone not yet on it. */
  canHold: boolean;
  options: IntroPlanOption[];
};

/** The card the /intros page renders: the shared card view plus the plan step once connected. */
export type IntroCardData = IntroCardView & { plan: IntroPlanView | null };

export type IntroPlanAction = { action: 'hold' } | { action: 'pick'; questId: ID };
