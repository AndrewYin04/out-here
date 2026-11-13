import { z } from 'zod';
import { body, route } from '@/lib/api';

const BodyZ = z.object({ seconds: z.number().int().min(1).max(600) });

// POST /api/watch/:key/view body { seconds } -> { ok: true }
// Records a view; publishes user:<viewer> {type:"watch"} so Marketplace picks refetch.
export const POST = route<{ key: string }>(async ({ store, viewer, params, req }) =>
  store.recordWatch(viewer.id, params.key, (await body(req, BodyZ)).seconds));
