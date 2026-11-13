// GET /api/muse/finds?lat&lng -> { finds: MuseFind[] }
//     The viewer's wants matched against listings open for pickup (code: keyword, price, drive
//     time, pickup window), else Reels they watched (the Reel's look-for words), and Muse's one
//     line about the best match, checked against the facts.
import { z } from 'zod';
import { museFinds } from '@/features/muse';
import { now } from '@/shared';
import { route } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const QueryZ = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });

export const GET = route(async ({ store, viewer, req }) => {
  const q = QueryZ.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  const origin = q.success ? q.data : viewer.home;
  const [wants, reels] = await Promise.all([store.museWants(viewer.id), store.watchedReels(viewer.id)]);
  if (wants.length === 0 && reels.length === 0) return { finds: [] };
  const listings = await store.mapListings(viewer.id);
  return { finds: await museFinds(wants, listings, origin, now(), viewer.id, reels) };
});
