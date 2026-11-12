import { route } from '@/lib/api';

// GET /api/profile/:handle -> ProfileResponse (fields filtered by fieldVisibility)
export const GET = route<{ handle: string }>(async ({ store, viewer, params }) => (await store.profile(viewer.id, params.handle)));
