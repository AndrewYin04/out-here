import { z } from 'zod';
import { body, route } from '@/lib/api';

const RespondZ = z.object({ status: z.enum(['accepted', 'declined']) });

// POST /api/invites/:id/respond -> { invite, quest? } (accept joins the quest; 409 if full)
export const POST = route<{ id: string }>(async ({ store, viewer, params, req }) => {
  const b = await body(req, RespondZ);
  return store.respondInvite(viewer.id, params.id, b.status);
});
