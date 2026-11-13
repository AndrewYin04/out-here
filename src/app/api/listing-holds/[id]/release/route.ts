import { route } from '@/lib/api';

// POST /api/listing-holds/:id/release -> { listing: MapListing }   (buyer or seller cancels)
export const POST = route<{ id: string }>(async ({ store, viewer, params }) => store.releaseHold(viewer.id, params.id));
