// What the plan pipeline needs to know, and the interface that supplies it. The route asks
// the registered PlanContextProvider; the default one builds everything from the seed files
// (seed-context.ts) so /api/muse/plan works before the data layer is wired in. Integration
// swaps in a store-backed provider with setPlanContextProvider().
import type { Availability, ID, LatLng, Profile, Quest } from '../../shared';

export type PlanFriend = {
  profile: Profile;
  /** viewer.interests ∩ friend.interests (case-insensitive), in the viewer's wording. */
  sharedInterests: string[];
  /** The friend's status bubble as one line ("craving dumplings 🥟 · at work till 5:15"), when the viewer may see it. Text only, never coordinates. */
  status?: string | null;
};

export type PlanContext = {
  viewer: Profile;
  /** Accepted friends of the viewer. */
  friends: PlanFriend[];
  /** Availability the viewer may see (friends-only signals from `friends`). */
  friendAvailability: Availability[];
  /** Upcoming quests with exact locations (server-side only; never sent to the client). */
  quests: Quest[];
  /** Where the viewer is starting from. */
  location: LatLng;
  now: Date;
  /** First names of every person the context mentions, used to catch leaked names. */
  knownPeople: { id: ID; firstName: string }[];
};

export type PlanContextRequest = {
  /** Profile id or persona handle; null means the demo driver. */
  userId: string | null;
  location: LatLng | null;
  now: Date;
};

export interface PlanContextProvider {
  getPlanContext(req: PlanContextRequest): Promise<PlanContext>;
}

export class UnknownUserError extends Error {
  constructor(userId: string) {
    super(`unknown user ${userId}`);
    this.name = 'UnknownUserError';
  }
}

export function firstName(p: Pick<Profile, 'name'>): string {
  return p.name.split(' ')[0] ?? p.name;
}

export function sharedInterests(a: readonly string[], b: readonly string[]): string[] {
  const lower = new Set(b.map((x) => x.toLowerCase()));
  return a.filter((x) => lower.has(x.toLowerCase()));
}

let provider: PlanContextProvider | null = null;

/** Registers the provider the route uses (the data layer calls this at integration). */
export function setPlanContextProvider(p: PlanContextProvider | null): void {
  provider = p;
}

export async function getPlanContextProvider(): Promise<PlanContextProvider> {
  if (provider) return provider;
  const { seedPlanContextProvider } = await import('./seed-context');
  return seedPlanContextProvider;
}
