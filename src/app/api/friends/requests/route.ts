import { z } from 'zod';
import { body, IdZ, route } from '@/lib/api';

// GET /api/friends/requests -> { incoming, outgoing }
export const GET = route(async ({ store, viewer }) => store.friendRequests(viewer.id));

// POST /api/friends/requests body { toId } -> { friendship } (toId may be an id or a handle)
export const POST = route(async ({ store, viewer, req }) => {
  const b = await body(req, z.object({ toId: IdZ }));
  return { friendship: await store.sendFriendRequest(viewer.id, b.toId) };
});
