import { z } from 'zod';
import { query, route } from '@/lib/api';

// GET /api/daily/side-quest/board?date -> SideQuestBoardResponse (shared entries only; names are
// first names for non-friends; entries show after you enter or your quest ends).
export const GET = route(async ({ store, viewer, url }) => {
  const q = query(url, z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }));
  return store.sideQuestBoard(viewer.id, q.date);
});
