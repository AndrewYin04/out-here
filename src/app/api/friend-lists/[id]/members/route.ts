import { z } from 'zod';
import { body, IdZ, route } from '@/lib/api';

// POST /api/friend-lists/:id/members body { userId } -> { list } (friends only)
export const POST = route<{ id: string }>(async ({ store, viewer, params, req }) => {
  const b = await body(req, z.object({ userId: IdZ }));
  return { list: await store.addListMember(viewer.id, params.id, b.userId) };
});
