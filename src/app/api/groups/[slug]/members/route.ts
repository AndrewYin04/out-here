import { route } from '@/lib/api';

// GET /api/groups/:slug/members -> { members, friendCount } (friends first)
export const GET = route<{ slug: string }>(async ({ store, viewer, params }) => (await store.groupMembers(viewer.id, params.slug)));
