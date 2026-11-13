import { route } from '@/lib/api';

// GET /api/listings/:id/pickup -> { listing: MapListing } (any status, so the sheet can show "Sold")
export const GET = route<{ id: string }>(async ({ store, viewer, params }) => store.mapListing(viewer.id, params.id));
