import { route } from '@/lib/api';

// GET /api/availability/free-with-me -> FreeWithMeResponse (friends free when the viewer is, ranked)
export const GET = route(async ({ store, viewer }) => store.freeWithMe(viewer.id));
