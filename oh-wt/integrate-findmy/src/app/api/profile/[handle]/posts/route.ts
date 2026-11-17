import { z } from 'zod';
import { query, route } from '@/lib/api';

const CursorZ = z.object({ cursor: z.string().max(500).optional() });

// GET /api/profile/:handle/posts?cursor -> FeedResponse
export const GET = route<{ handle: string }>(async ({ store, viewer, params, url }) =>
  store.profilePosts(viewer.id, params.handle, query(url, CursorZ).cursor));
