import { route } from '@/lib/api';
import { DEMO_CENTER, walkingMinutes, type ID } from '@/shared';
import type { MapContext } from '@/features/map/types';

// GET /out-here/context -> MapContext for the viewer (x-persona): their profile, where walking
// times are measured from (their own Find My share, the point their "You" pin sits on, else their
// home), walking minutes to every quest they can see, and their
// friend ids (the Friends view shows quests friends joined). Walking minutes are computed here on
// the server from the same point the quest pin uses, so the client never does distance math.
export const GET = route(async ({ store, viewer }) => {
  const [quests, friends, share] = await Promise.all([
    store.questsNear(viewer.id, DEMO_CENTER, 50_000),
    store.friends(viewer.id),
    store.myLocation(viewer.id),
  ]);
  // One self position: the Friends map's You pin and every walking time use this same point.
  const origin = share?.location ?? viewer.home;
  const walkMinutes: Record<ID, number> = {};
  for (const q of quests) walkMinutes[q.id] = walkingMinutes(origin, q.location);
  const out: MapContext = {
    viewer,
    origin,
    walkMinutes,
    friendIds: friends.map((f) => f.id),
    friends: friends.map((f) => ({ id: f.id, name: f.name, avatarUrl: f.avatarUrl })),
  };
  return out;
});
