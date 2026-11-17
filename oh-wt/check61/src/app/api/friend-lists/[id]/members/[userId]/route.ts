import { route } from '@/lib/api';

// DELETE /api/friend-lists/:id/members/:userId -> { list }
export const DELETE = route<{ id: string; userId: string }>(async ({ store, viewer, params }) =>
  ({ list: await store.removeListMember(viewer.id, params.id, params.userId) }));
