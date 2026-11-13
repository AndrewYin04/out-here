// GET  /api/listings/drafts                -> { sales: SaleDraft[] }   (the viewer's own draft sales)
// POST /api/listings/drafts  body: { label } -> { listingIds, pickupUntil } (Go live: on the map now)
// A draft sale is a seller's listings with a pickup label and place but no pickup window yet, so a
// prefilled pop-up goes live in one tap. Publishes listings:new {listingId} per item.
import { z } from 'zod';
import { body, route } from '@/lib/api';

const BodyZ = z.object({ label: z.string().trim().min(1).max(80) });

export const GET = route(async ({ store, viewer }) => store.saleDrafts(viewer.id));

export const POST = route(async ({ store, viewer, req }) => {
  const b = await body(req, BodyZ);
  return store.goLiveSale(viewer.id, b.label);
}, { refresh: ['listings'] });
