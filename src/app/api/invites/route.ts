import { z } from 'zod';
import { assertSelf, body, IdZ, route } from '@/lib/api';

const CreateZ = z.object({
  fromId: IdZ.optional(),
  toId: IdZ,
  questId: IdZ.nullable().default(null),
  suggestionTitle: z.string().trim().min(1).max(160),
  message: z.string().max(1000).default(''),
});

// GET /api/invites -> { incoming, outgoing }
export const GET = route(async ({ store, viewer }) => store.invites(viewer.id));

// POST /api/invites -> { invite } (also lands in Messenger as an invite message)
export const POST = route(async ({ store, viewer, req }) => {
  const b = await body(req, CreateZ);
  assertSelf(viewer, b.fromId);
  return { invite: await store.createInvite(viewer.id, b) };
});
