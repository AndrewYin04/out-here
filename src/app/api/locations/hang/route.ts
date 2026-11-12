import { z } from 'zod';
import { body, IdZ, route } from '@/lib/api';

const HangZ = z.object({
  toId: IdZ,
  questId: IdZ.nullable().optional(),
  placeId: IdZ.nullable().optional(),
  message: z.string().trim().max(500).default(''),
});

// POST /api/locations/hang -> { invite, suggestion } ("Want to hang?" from a friend card)
export const POST = route(async ({ store, viewer, req }) => {
  const b = await body(req, HangZ);
  return await store.hangInvite(viewer.id, b);
});
