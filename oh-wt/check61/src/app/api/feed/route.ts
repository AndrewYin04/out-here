import { z } from 'zod';
import { query, route } from '@/lib/api';

const CursorZ = z.object({ cursor: z.string().max(500).optional() });

// GET /api/feed?cursor -> FeedResponse (friends' and joined groups' posts the viewer may see, newest first)
export const GET = route(async ({ store, viewer, url }) => store.feed(viewer.id, query(url, CursorZ).cursor));
