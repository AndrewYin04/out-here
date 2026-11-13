import { route } from '@/lib/api';

// POST /api/listings/:id/sold -> { listing: MapListing }   (seller; the pin leaves the map)
export const POST = route<{ id: string }>(async ({ store, viewer, params }) => store.markSold(viewer.id, params.id));
