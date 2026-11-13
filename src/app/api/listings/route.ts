import { z } from 'zod';
import { body, LatLngZ, route } from '@/lib/api';

const CreateZ = z.object({
  title: z.string().trim().min(2).max(80),
  priceUsd: z.number().min(0).max(100_000),
  category: z.string().trim().min(1).max(40),
  description: z.string().trim().max(500).optional(),
  imageUrl: z.string().max(500).nullish(),
  location: LatLngZ,
  pickupLabel: z.string().trim().min(1).max(80),
  pickupSpot: z.string().trim().min(1).max(120),
  pickupUntil: z.string().datetime({ offset: true }),
});

// GET  /api/listings -> { listings }   (the Marketplace grid; never carries the exact pickup spot)
// POST /api/listings body CreateListingBody -> { listing: MapListing }   (publishes listings:new)
export const GET = route(async ({ store }) => ({ listings: await store.listings() }));
export const POST = route(async ({ store, viewer, req }) => store.createListing(viewer.id, await body(req, CreateZ)));
