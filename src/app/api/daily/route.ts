import { z } from 'zod';
import { demoDate } from '@/shared';
import { query, route } from '@/lib/api';

// GET /api/daily?date=YYYY-MM-DD -> DailyQuest (default: today in DEMO_TZ)
export const GET = route(async ({ store, url }) => {
  const q = query(url, z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }));
  return store.daily(q.date ?? demoDate());
});
