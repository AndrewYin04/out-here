import { z } from 'zod';
import { IsoZ, query, route } from '@/lib/api';

const RangeZ = z.object({ from: IsoZ.optional(), to: IsoZ.optional() });

// GET /api/events?from&to -> { events: EventView[] } (default: not yet ended)
export const GET = route(async ({ store, viewer, url }) => {
  const q = query(url, RangeZ);
  const iso = (s?: string) => (s ? new Date(s).toISOString() : undefined);
  return { events: await store.events(viewer.id, iso(q.from), iso(q.to)) };
});
