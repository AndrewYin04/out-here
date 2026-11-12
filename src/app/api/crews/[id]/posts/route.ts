import { z } from 'zod';
import { query, route } from '@/lib/api';

// GET /api/crews/:id/posts?cursor -> FeedResponse (a crew's private Memories board; members only)
export const GET = route<{ id: string }>(async ({ store, viewer, params, url }) => {
  const q = query(url, z.object({ cursor: z.string().max(200).optional() }));
  return store.crewPosts(viewer.id, params.id, q.cursor ?? null);
});
