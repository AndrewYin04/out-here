import { z } from 'zod';
import { body, IdZ, route } from '@/lib/api';

// GET /api/threads -> { threads: ThreadView[] }
export const GET = route(async ({ store, viewer }) => ({ threads: await store.threads(viewer.id) }));

const OpenZ = z.object({ memberIds: z.array(IdZ).min(1).max(30), name: z.string().trim().max(80).nullish() });

// POST /api/threads body { memberIds, name? } -> { thread } (returns the existing 1:1 thread)
export const POST = route(async ({ store, viewer, req }) => {
  const b = await body(req, OpenZ);
  return { thread: await store.openThread(viewer.id, b.memberIds, b.name ?? null) };
});
