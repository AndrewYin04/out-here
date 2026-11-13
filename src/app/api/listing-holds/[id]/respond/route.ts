import { z } from 'zod';
import { body, route } from '@/lib/api';

const RespondZ = z.object({ accept: z.boolean() });

// POST /api/listing-holds/:id/respond body { accept } -> { listing: MapListing }
// Seller only. Accept holds the item for the buyer's ETA + 15 min and declines other requests.
export const POST = route<{ id: string }>(async ({ store, viewer, params, req }) =>
  store.respondHold(viewer.id, params.id, (await body(req, RespondZ)).accept));
