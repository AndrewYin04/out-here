import { z } from 'zod';
import { body, route } from '@/lib/api';

// GET /api/daily/side-quest/prefs -> SideQuestPrefs (the active window; outside it is quiet hours)
export const GET = route(async ({ store, viewer }) => store.sideQuestPrefs(viewer.id));

// PUT /api/daily/side-quest/prefs { startMin, endMin, tz } -> SideQuestPrefs. Applies to days
// without a drop yet; today's persisted drop never changes.
export const PUT = route(async ({ store, viewer, req }) => {
  const b = await body(req, z.object({
    startMin: z.number().int().min(0).max(1439), endMin: z.number().int().min(1).max(1440), tz: z.string().min(1).max(64),
  }));
  return store.setSideQuestPrefs(viewer.id, b);
});
