import { route } from '@/lib/api';

// GET /api/friends -> { friends: PersonCard[] }
export const GET = route(async ({ store, viewer }) => ({ friends: await store.friends(viewer.id) }));
