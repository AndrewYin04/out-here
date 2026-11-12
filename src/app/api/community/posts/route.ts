import { z } from 'zod';
import { query, route } from '@/lib/api';

// GET /api/community/posts?cursor -> CommunityBoardResponse (public Memories board; strangers by first name)
export const GET = route(async ({ store, viewer, url }) => {
  const q = query(url, z.object({ cursor: z.string().max(200).optional() }));
  return store.communityPosts(viewer.id, q.cursor ?? null);
});
