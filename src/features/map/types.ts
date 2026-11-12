import type { ID, LatLng, Profile } from '@/shared';

/** GET /out-here/context response (route in src/app/(fb)/out-here/context). */
export type MapContext = {
  viewer: Profile;
  /** Where walking minutes are measured from: the viewer's home. */
  origin: LatLng;
  /** Server-computed walking minutes from `origin` to each visible quest's returned location. */
  walkMinutes: Record<ID, number>;
  friendIds: ID[];
};

export type MapMode = 'explore' | 'friends';
