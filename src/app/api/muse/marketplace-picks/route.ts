// GET /api/muse/marketplace-picks?lat&lng&exclude=a,b -> MarketplacePicksResponse
//     Marketplace shows only what fits what the viewer watches. Muse reads their watch history
//     into topics (each with the videos behind it), then picks only the listings that fit a
//     topic, with a reason. Code checks every video key, listing id and number (watch-picks.ts).
//     exclude: topic names the viewer switched off.
import { z } from 'zod';
import { marketplacePicks } from '@/features/muse';
import { now } from '@/shared';
import { route } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const QueryZ = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });

export const GET = route(async ({ store, viewer, url }) => {
  const q = QueryZ.safeParse(Object.fromEntries(url.searchParams));
  const exclude = (url.searchParams.get('exclude') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 10);
  const ctx = await store.marketplaceContext(viewer.id);
  return marketplacePicks({
    ...ctx, origin: q.success ? q.data : viewer.home, at: now(), exclude, userId: viewer.id,
  });
});
