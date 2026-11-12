import { z } from 'zod';
import { assertSelf, body, IdZ, route } from '@/lib/api';

const EntryZ = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  userId: IdZ.optional(),
  photoUrl: z.string().min(1).max(2000),
});

// POST /api/daily/entry -> { entry }
export const POST = route(async ({ store, viewer, req }) => {
  const b = await body(req, EntryZ);
  assertSelf(viewer, b.userId);
  return { entry: await store.dailyEntry(viewer.id, b) };
});
