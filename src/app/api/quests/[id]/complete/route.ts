import { z } from 'zod';
import { assertSelf, body, IdZ, route } from '@/lib/api';

const BodyZ = z.object({ userId: IdZ.optional() });

// POST /api/quests/:id/complete body { userId? } -> { quest, crew } (host only)
export const POST = route<{ id: string }>(async ({ store, viewer, params, req }) => {
  const b = await body(req, BodyZ);
  assertSelf(viewer, b.userId);
  return store.completeQuest(viewer.id, params.id);
});
