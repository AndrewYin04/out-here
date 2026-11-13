import { route } from '@/lib/api';

// GET /api/listings/map -> { listings: MapListing[] }
// Listings with an open pickup window, as this viewer may see them (exact spot only for the
// seller and an accepted buyer).
export const GET = route(async ({ store, viewer }) => ({ listings: await store.mapListings(viewer.id) }));
