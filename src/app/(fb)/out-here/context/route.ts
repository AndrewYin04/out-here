import { z } from 'zod';
import { query, route } from '@/lib/api';
import { DEMO_CENTER, walkingMinutes, type ID } from '@/shared';
import type { MapContext } from '@/features/map/types';

// GET /out-here/context -> MapContext for the viewer (x-persona): their profile, where walking
// times are measured from (their home), walking minutes to every quest they can see, and their
// friend ids (the Friends view shows quests friends joined). Walking minutes are computed here on
// the server from the same point the quest pin uses, so the client never does distance math.
// ?lat&lng: "Here" mode (the viewer's real location, used for this request only, never stored).
const HereZ = z.object({ lat: z.coerce.number().min(-90).max(90).optional(), lng: z.coerce.number().min(-180).max(180).optional() });

export const GET = route(async ({ store, viewer, url }) => {
  const q = query(url, HereZ);
  const here = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : null;
  const from = here ?? viewer.home;
  const [quests, friends] = await Promise.all([
    store.questsNear(viewer.id, here ?? DEMO_CENTER, 50_000),
    store.friends(viewer.id),
  ]);
  const walkMinutes: Record<ID, number> = {};
  for (const q of quests) walkMinutes[q.id] = walkingMinutes(from, q.location);
  const out: MapContext = {
    viewer,
    origin: from,
    walkMinutes,
    friendIds: friends.map((f) => f.id),
    friends: friends.map((f) => ({ id: f.id, name: f.name, avatarUrl: f.avatarUrl })),
  };
  return out;
});
