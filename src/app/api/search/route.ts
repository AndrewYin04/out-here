import { z } from 'zod';
import { query, route } from '@/lib/api';

const SearchZ = z.object({
  q: z.string().max(200).default(''),
  type: z.enum(['all', 'people', 'groups', 'events', 'quests']).default('all'),
});

// GET /api/search?q&type -> SearchResponse
export const GET = route(async ({ store, viewer, url }) => {
  const s = query(url, SearchZ);
  return store.search(viewer.id, s.q, s.type);
});
