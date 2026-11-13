import { z } from 'zod';
import { body, route } from '@/lib/api';

const BodyZ = z.object({ reason: z.string().trim().max(300).default('') });

// POST /api/quests/:id/report body { reason? } -> { ok: true } (hidden from the reporter right away)
export const POST = route<{ id: string }>(async ({ store, viewer, params, req }) => {
  const b = await body(req, BodyZ);
  return store.reportQuest(viewer.id, params.id, b.reason);
});
