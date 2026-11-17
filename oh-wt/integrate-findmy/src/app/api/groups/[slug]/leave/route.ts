import { route } from '@/lib/api';

// POST /api/groups/:slug/leave -> { group: GroupView }
export const POST = route<{ slug: string }>(async ({ store, viewer, params }) => ({ group: await store.leaveGroup(viewer.id, params.slug) }));
