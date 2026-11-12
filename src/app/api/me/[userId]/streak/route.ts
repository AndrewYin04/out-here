import { forbidden } from '@/features/data/server';
import { route } from '@/lib/api';

// GET /api/me/:userId/streak -> { weeks, thisWeekDone } (:userId must be the viewer or "me")
export const GET = route<{ userId: string }>(async ({ store, viewer, params }) => {
  if (![viewer.id, viewer.handle, 'me'].includes(params.userId)) throw forbidden();
  return store.streak(viewer.id);
});
