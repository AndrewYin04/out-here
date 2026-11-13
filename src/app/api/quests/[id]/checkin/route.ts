import { z } from 'zod';
import { body, LatLngZ, route } from '@/lib/api';

const BodyZ = z.object({ location: LatLngZ });

// POST /api/quests/:id/checkin body { location } -> { hereCount }
// Members only, while the plan is live (or 15 min before), within 150 m of the exact spot.
export const POST = route<{ id: string }>(async ({ store, viewer, params, req }) => {
  const b = await body(req, BodyZ);
  return store.checkIn(viewer.id, params.id, b.location);
});
