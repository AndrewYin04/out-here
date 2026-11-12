import { route } from '@/lib/api';

// POST /api/groups/:slug/join -> { group: GroupView }
export const POST = route<{ slug: string }>(async ({ store, viewer, params }) => ({ group: await store.joinGroup(viewer.id, params.slug) }));
