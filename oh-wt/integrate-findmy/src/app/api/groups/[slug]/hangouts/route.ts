import { route } from '@/lib/api';

// GET /api/groups/:slug/hangouts -> { quests } (the group's active Out Here quests)
export const GET = route<{ slug: string }>(async ({ store, viewer, params }) => ({ quests: await store.groupHangouts(viewer.id, params.slug) }));
