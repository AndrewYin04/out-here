import { route } from '@/lib/api';

// GET /api/events/:slug -> EventResponse (guests: friends first)
export const GET = route<{ slug: string }>(async ({ store, viewer, params }) => (await store.event(viewer.id, params.slug)));
