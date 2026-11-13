// GET /api/muse/runs?since=<iso>&limit=<n> -> { store, prebake, runs: RunSummary[] }
// The viewer's latest Muse calls from muse_runs (MemoryStore mode: the in-process log), newest
// first. Metadata only: route, model, latency, ok, and whether the answer was pre-baked; never
// the prompt or the output. The warm-up reads it to show what the cache holds; Q&A shows it as
// the log.
import { z } from 'zod';
import { museStore, prebakeMode, stageTimeoutMs } from '@/features/muse';
import { IsoZ, query, route } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QueryZ = z.object({
  since: IsoZ.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const GET = route(async ({ req, viewer }) => {
  const q = query(new URL(req.url), QueryZ);
  const store = await museStore();
  const runs = await store.recentRuns(viewer.id, q.since ?? null, q.limit);
  return { store: store.kind, prebake: { mode: prebakeMode(), stageTimeoutMs: stageTimeoutMs() }, runs };
});
