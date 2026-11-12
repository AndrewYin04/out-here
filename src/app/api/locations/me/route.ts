import { z } from 'zod';
import { audienceListId, type Audience } from '@/shared';
import { body, LatLngZ, route } from '@/lib/api';

// Location sharing never goes public: friends, only me, or one of my friend lists.
const ShareAudienceZ = z.string().refine(
  (s) => s === 'friends' || s === 'only_me' || audienceListId(s as Audience) !== null,
  'must be friends, only_me or list:<id>',
).transform((s) => s as Audience);

const line = z.string().trim().max(80).nullable();

const PutZ = z.object({
  location: LatLngZ.optional(),
  placeLabel: z.string().trim().max(80).nullable().optional(),
  precision: z.enum(['exact', 'approximate']).optional(),
  audience: ShareAudienceZ.optional(),
  paused: z.boolean().optional(),
  bubble: z.object({
    emoji: z.string().trim().max(16).nullable().optional(),
    thought: line.optional(),
    doing: line.optional(),
    wantsTo: line.optional(),
  }).strict().optional(),
}).strict();

// GET /api/locations/me -> { share: LocationShare | null }
export const GET = route(async ({ store, viewer }) => ({ share: await store.myLocation(viewer.id) }));

// PUT /api/locations/me -> { share } (refreshes expiry; notifies old and new audience on user:<id>)
export const PUT = route(async ({ store, viewer, req }) => {
  const b = await body(req, PutZ);
  return { share: await store.updateMyLocation(viewer.id, b) };
});
