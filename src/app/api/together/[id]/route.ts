import { route } from '@/lib/api';

// GET /api/together/:id -> { plan } (members only)
export const GET = route<{ id: string }>(async ({ store, viewer, params }) => ({ plan: await store.together(viewer.id, params.id) }));
