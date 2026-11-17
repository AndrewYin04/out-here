import { route } from '@/lib/api';

// GET /api/crews -> { crews } (the viewer's crews; the viewer comes from x-persona)
export const GET = route(async ({ store, viewer }) => ({ crews: await store.crews(viewer.id) }));
