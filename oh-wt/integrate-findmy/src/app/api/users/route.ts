import { route } from '@/lib/api';

// GET /api/users -> { users: Profile[] } (the 8 demo personas, visibility-filtered for the viewer)
export const GET = route(async ({ store, viewer }) => ({ users: await store.users(viewer.id) }));
