import { z } from 'zod';
import { assertSelf, AudienceZ, body, IdZ, IsoZ, LatLngZ, route } from '@/lib/api';

const CreateZ = z.object({
  userId: IdZ.optional(),
  text: z.string().trim().min(1).max(280),
  startsAt: IsoZ,
  endsAt: IsoZ,
  location: LatLngZ,
  audience: AudienceZ.optional(),
});

// GET /api/availability -> { items: Availability[] } (the viewer's own active signals)
export const GET = route(async ({ store, viewer }) => ({ items: await store.myAvailability(viewer.id) }));

// POST /api/availability -> { availability } (audience defaults to friends)
export const POST = route(async ({ store, viewer, req }) => {
  const b = await body(req, CreateZ);
  assertSelf(viewer, b.userId);
  return { availability: await store.createAvailability(viewer.id, b) };
});
