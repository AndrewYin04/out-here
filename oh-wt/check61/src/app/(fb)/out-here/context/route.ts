import { route } from '@/lib/api';
import { DEMO_CENTER, walkingMinutes, type ID } from '@/shared';
import type { MapContext } from '@/features/map/types';

// GET /out-here/context -> MapContext for the viewer (x-persona): their profile, where walking
// times are measured from (their home), walking minutes to every quest they can see, and their
// friend ids (the Friends view shows quests friends joined). Walking minutes are computed here on
// the server from the same point the quest pin uses, so the client never does distance math.
export const GET = route(async ({ store, viewer }) => {
  const [quests, friends] = await Promise.all([
    store.questsNear(viewer.id, DEMO_CENTER, 50_000),
    store.friends(viewer.id),
  ]);
  const walkMinutes: Record<ID, number> = {};
  for (const q of quests) walkMinutes[q.id] = walkingMinutes(viewer.home, q.location);
  const out: MapContext = {
    viewer,
    origin: viewer.home,
    walkMinutes,
    friendIds: friends.map((f) => f.id),
    friends: friends.map((f) => ({ id: f.id, name: f.name, avatarUrl: f.avatarUrl })),
  };
  return out;
});
