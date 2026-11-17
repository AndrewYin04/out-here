import { z } from 'zod';
import { body, route } from '@/lib/api';

// PATCH /api/friend-lists/:id body { name } -> { list } (ext: rename)
export const PATCH = route<{ id: string }>(async ({ store, viewer, params, req }) => {
  const b = await body(req, z.object({ name: z.string().trim().min(1).max(60) }));
  return { list: await store.renameFriendList(viewer.id, params.id, b.name) };
});

// DELETE /api/friend-lists/:id -> { ok: true } (ext)
export const DELETE = route<{ id: string }>(async ({ store, viewer, params }) => {
  await store.deleteFriendList(viewer.id, params.id);
  return { ok: true };
});
