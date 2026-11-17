import { route } from '@/lib/api';

// GET /api/posts/:id -> { post: PostView }
export const GET = route<{ id: string }>(async ({ store, viewer, params }) => ({ post: await store.post(viewer.id, params.id) }));
