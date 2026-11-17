import { z } from 'zod';
import { assertSelf, body, IdZ, route } from '@/lib/api';

const BodyZ = z.object({ userId: IdZ.optional(), withFriendId: IdZ.nullish() });

// POST /api/quests/:id/join body { userId?, withFriendId? } -> { quest, seatsLeft } (409 quest_full)
export const POST = route<{ id: string }>(async ({ store, viewer, params, req }) => {
  const b = await body(req, BodyZ);
  assertSelf(viewer, b.userId);
  return store.joinQuest(viewer.id, params.id, b.withFriendId ?? null);
});
