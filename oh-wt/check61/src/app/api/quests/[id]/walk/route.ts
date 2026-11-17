import { z } from 'zod';
import { body, LatLngZ, route } from '@/lib/api';

const BodyZ = z.object({ location: LatLngZ });

// GET /api/quests/:id/walk -> { walkers: Walker[] }
// The other members walking to this plan right now (#46). Members only.
export const GET = route<{ id: string }>(async ({ store, viewer, params }) => ({ walkers: await store.walkers(viewer.id, params.id) }));

// POST /api/quests/:id/walk body { location } -> { ok: true }
// One step of the viewer's walk to the plan; the other members refetch on user:<id>.
export const POST = route<{ id: string }>(async ({ store, viewer, params, req }) => {
  const b = await body(req, BodyZ);
  return store.postWalkStep(viewer.id, params.id, b.location);
});
