import { route } from '@/lib/api';

// GET /api/friends/suggestions -> { people: PersonCard[] } (ranked by mutual friends)
export const GET = route(async ({ store, viewer }) => ({ people: await store.suggestions(viewer.id) }));
