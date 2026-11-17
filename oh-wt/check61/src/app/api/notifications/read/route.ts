import { z } from 'zod';
import { body, IdZ, route } from '@/lib/api';

// POST /api/notifications/read body { ids? } (omitted = all) -> { unread }
export const POST = route(async ({ store, viewer, req }) => {
  const b = await body(req, z.object({ ids: z.array(IdZ).max(500).optional() }));
  return { unread: await store.markNotificationsRead(viewer.id, b.ids) };
});
