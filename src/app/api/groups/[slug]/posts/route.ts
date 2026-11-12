import { z } from 'zod';
import { query, route } from '@/lib/api';

const CursorZ = z.object({ cursor: z.string().max(500).optional() });

// GET /api/groups/:slug/posts?cursor -> FeedResponse (empty for non-members of a private group)
export const GET = route<{ slug: string }>(async ({ store, viewer, params, url }) =>
  store.groupPosts(viewer.id, params.slug, query(url, CursorZ).cursor));
