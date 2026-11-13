import { z } from 'zod';
import { body, IdZ, route } from '@/lib/api';

// POST /api/daily/side-quest/report { date, userId } -> { ok: true }. Recorded in daily_reports.
export const POST = route(async ({ store, viewer, req }) => {
  const b = await body(req, z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), userId: IdZ }));
  return store.sideQuestReport(viewer.id, b);
});
