import { forbidden } from '@/features/data/server';
import { route } from '@/lib/api';

// GET /api/friends/:userId/availability -> { items } (friends-only; :userId must be the viewer or "me")
export const GET = route<{ userId: string }>(async ({ store, viewer, params }) => {
  if (![viewer.id, viewer.handle, 'me'].includes(params.userId)) throw forbidden('only your own friends\' availability');
  return { items: await store.friendAvailability(viewer.id) };
});
