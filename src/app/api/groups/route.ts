import { z } from 'zod';
import { query, route } from '@/lib/api';

const FilterZ = z.object({ filter: z.enum(['all', 'mine', 'discover']).default('all') });

// GET /api/groups?filter=all|mine|discover -> { groups: GroupView[] }
export const GET = route(async ({ store, viewer, url }) => ({ groups: await store.groups(viewer.id, query(url, FilterZ).filter) }));
