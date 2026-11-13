import { z } from 'zod';
import { body, IdZ, route } from '@/lib/api';

const VoteZ = z.object({ questId: IdZ, in: z.boolean() });

// POST /api/together/:id/vote { questId, in } -> { plan } (locks when every member is in on one option)
export const POST = route<{ id: string }>(async ({ store, viewer, params, req }) => {
  const b = await body(req, VoteZ);
  return { plan: await store.voteTogether(viewer.id, params.id, b.questId, b.in) };
});
