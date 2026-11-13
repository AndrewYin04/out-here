// GET /api/muse/runs -> { runs: MuseOp[] }
// The viewer's own recent Muse operations from the run log (muse_runs), newest first: which Muse
// job ran, the model, how long it took, and whether it was live, cached, mock or failed. Metadata
// only: no input, output, prompt or error text, and only the viewer's own runs.
import { getRunStore } from '@/features/muse';
import { route } from '@/lib/api';
import type { MuseOp } from '@/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async ({ viewer }) => {
  const store = await getRunStore();
  const runs: MuseOp[] = await store.recent(viewer.id, 40);
  return { runs };
});
