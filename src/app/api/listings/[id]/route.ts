import { route } from '@/lib/api';

// GET /api/listings/:id -> { listing, seller }
export const GET = route<{ id: string }>(async ({ store, viewer, params }) => (await store.listing(viewer.id, params.id)));
