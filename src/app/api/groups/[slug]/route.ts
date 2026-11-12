import { route } from '@/lib/api';

// GET /api/groups/:slug -> GroupResponse
export const GET = route<{ slug: string }>(async ({ store, viewer, params }) => (await store.group(viewer.id, params.slug)));
