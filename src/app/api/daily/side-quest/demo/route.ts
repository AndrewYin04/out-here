import { z } from 'zod';
import { body, route } from '@/lib/api';

// POST /api/daily/side-quest/demo { deadlineSeconds? } -> SideQuestState. The presenter button:
// opens today's Side Quest now. 403 unless the server enables it (OUTHERE_DEMO_CONTROLS) AND the
// viewer is a demo persona. Touches only the viewer's own Side Quest records for today.
export const POST = route(async ({ store, viewer, req }) => {
  const b = await body(req, z.object({ deadlineSeconds: z.number().int().min(10).max(3600).optional() }));
  return store.sideQuestTrigger(viewer.id, b.deadlineSeconds);
});
