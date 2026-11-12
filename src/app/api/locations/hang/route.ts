import { z } from 'zod';
import { body, IdZ, query, route } from '@/lib/api';

const HangZ = z.object({
  toId: IdZ,
  questId: IdZ.nullable().optional(),
  placeId: IdZ.nullable().optional(),
  message: z.string().trim().max(500).default(''),
});

// GET /api/locations/hang?toId=<id|handle> -> { suggestion: HangSuggestion | null }
// What "Want to hang?" would propose, shown on the friend card before sending.
export const GET = route(async ({ store, viewer, url }) => {
  const { toId } = query(url, z.object({ toId: IdZ }));
  return { suggestion: await store.hangSuggestion(viewer.id, toId) };
});

// POST /api/locations/hang -> { invite, suggestion } ("Want to hang?" from a friend card)
export const POST = route(async ({ store, viewer, req }) => {
  const b = await body(req, HangZ);
  return await store.hangInvite(viewer.id, b);
});
