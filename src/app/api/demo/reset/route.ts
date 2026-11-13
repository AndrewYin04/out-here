import { buildMemoryDb, forbidden } from '@/features/data/server';
import { route } from '@/lib/api';
import { now } from '@/shared';

// POST /api/demo/reset -> { ok, quests, members }
// Puts the demo story back to "now" (plans, seats, free windows, invites, shared plans).
// Where DEMO_RESET_TOKEN is set (the deployed demo), the request must carry it in x-demo-key:
// open the app once with ?demoKey=<token> and the Reset demo button sends it.
export const POST = route(async ({ store, req }) => {
  const key = process.env.DEMO_RESET_TOKEN;
  if (key && req.headers.get('x-demo-key') !== key) throw forbidden('demo reset needs the demo key: open the app once with ?demoKey=…');
  return { ok: true, ...(await store.resetStory(buildMemoryDb(now()))) };
});
