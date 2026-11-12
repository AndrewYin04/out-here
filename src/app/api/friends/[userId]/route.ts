import { route } from '@/lib/api';

// DELETE /api/friends/:userId -> { ok: true } (unfriend; also cancels a pending request)
export const DELETE = route<{ userId: string }>(async ({ store, viewer, params }) => {
  await store.unfriend(viewer.id, params.userId);
  return { ok: true };
});
