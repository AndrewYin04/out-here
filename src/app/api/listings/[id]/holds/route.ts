import { z } from 'zod';
import { body, route } from '@/lib/api';

const HoldZ = z.object({
  offerUsd: z.number().min(0).max(100_000),
  etaMin: z.number().int().min(1).max(240),
  message: z.string().max(300).default(''),
});

// POST /api/listings/:id/holds body { offerUsd, etaMin, message } -> { listing: MapListing }
// "Reserve for pickup": asks the seller. 409 when reserved or the buyer already asked.
export const POST = route<{ id: string }>(async ({ store, viewer, params, req }) =>
  store.requestHold(viewer.id, params.id, await body(req, HoldZ)));
