import type { ID, LatLng, Profile } from '@/shared';

/** GET /out-here/context response (route in src/app/(fb)/out-here/context). */
export type MapContext = {
  viewer: Profile;
  /** Where walking minutes are measured from: the viewer's Find My share location, else their home. */
  origin: LatLng;
  /** Server-computed walking minutes from `origin` to each visible quest's returned location. */
  walkMinutes: Record<ID, number>;
  friendIds: ID[];
  /** The viewer's friends' names and faces (Friends mode avatar stacks). */
  friends: FriendFace[];
};

export type MapMode = 'explore' | 'friends';

/** A friend's face on a quest pin in Friends mode. */
export type FriendFace = { id: ID; name: string; avatarUrl: string };
