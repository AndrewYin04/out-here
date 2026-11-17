import { z } from 'zod';
import { body, route } from '@/lib/api';

// GET /api/friend-lists -> { lists }
export const GET = route(async ({ store, viewer }) => ({ lists: await store.friendLists(viewer.id) }));

// POST /api/friend-lists body { name } -> { list }
export const POST = route(async ({ store, viewer, req }) => {
  const b = await body(req, z.object({ name: z.string().trim().min(1).max(60) }));
  return { list: await store.createFriendList(viewer.id, b.name) };
});
