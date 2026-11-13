import { z } from 'zod';
import { query, route } from '@/lib/api';

// DELETE /api/daily/side-quest/entry?date -> SideQuestState. Unshares from the community board;
// the photo stays in the person's own Memories.
export const DELETE = route(async ({ store, viewer, url }) => {
  const q = query(url, z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }));
  return store.sideQuestUnshare(viewer.id, q.date);
});
