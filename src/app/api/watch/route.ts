import { route } from '@/lib/api';

// GET /api/watch -> { videos, history }   (the fictional Watch catalogue and the viewer's views)
export const GET = route(async ({ store, viewer }) => store.watch(viewer.id));
