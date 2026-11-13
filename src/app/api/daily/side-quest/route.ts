import { route } from '@/lib/api';

// GET /api/daily/side-quest -> SideQuestState. The first read of the day rolls and saves the
// viewer's drop time and deadline; every later read (any device) returns the same ones.
// Send x-outhere-fresh: 1 to read through the database cache.
export const GET = route(async ({ store, viewer }) => store.sideQuestState(viewer.id));
