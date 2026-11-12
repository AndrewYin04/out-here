import { z } from 'zod';
import { body, IdZ, route } from '@/lib/api';

const RespondZ = z.object({ fromId: IdZ, action: z.enum(['confirm', 'delete']) });

// POST /api/friends/requests/respond body { fromId, action } -> { friendship | null }
export const POST = route(async ({ store, viewer, req }) => {
  const b = await body(req, RespondZ);
  return { friendship: await store.respondFriendRequest(viewer.id, b.fromId, b.action) };
});
