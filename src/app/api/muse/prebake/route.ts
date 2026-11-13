// Prebaked Muse (docs/MUSE_PREBAKE.md): the warm-up's switch and status.
// GET  /api/muse/prebake?since=<iso>  -> { prebaked, source, store, entries, runs: { live, cached, failed, mock } }
//      runs counts muse_runs rows since `since` (default: the last 10 minutes).
// POST /api/muse/prebake { on?: boolean, clear?: boolean } -> the same status
//      on: turns prebaked mode on/off for every server instance (muse_settings.prebaked);
//      clear: deletes every cached answer (the muse_runs log stays).
//      Needs x-demo-key = DEMO_RESET_TOKEN when that is set; without it, only outside production.
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clearPrebakedMemo, getRunStore, isMockMode, prebakedOn } from '@/features/muse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodyZ = z.object({ on: z.boolean().optional(), clear: z.boolean().optional() }).strict();

async function status(since: string) {
  const store = await getRunStore();
  const env = process.env.MUSE_PREBAKED;
  const [prebaked, stats] = await Promise.all([prebakedOn(store), store.stats(since)]);
  return {
    prebaked,
    source: env === '1' || env === '0' ? 'env' : 'flag',
    mode: isMockMode() ? 'mock' : 'live',
    store: store.kind,
    ...stats,
  };
}

function allowed(req: Request): boolean {
  const key = process.env.DEMO_RESET_TOKEN?.trim();
  if (!key) return process.env.NODE_ENV !== 'production';
  const provided = req.headers.get('x-demo-key');
  if (!provided) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('since');
  const since = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw).toISOString() : new Date(Date.now() - 10 * 60_000).toISOString();
  try {
    return NextResponse.json(await status(since));
  } catch (err) {
    return NextResponse.json({ error: `status failed: ${String((err as Error)?.message ?? err).slice(0, 160)}` }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!allowed(req)) return NextResponse.json({ error: 'A valid demo key is required.' }, { status: 403 });
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'body must be JSON' }, { status: 400 });
  }
  const parsed = BodyZ.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid body' }, { status: 400 });
  try {
    const store = await getRunStore();
    let cleared: number | null = null;
    if (parsed.data.clear) cleared = await store.clearCache();
    if (parsed.data.on !== undefined) await store.setPrebakedFlag(parsed.data.on);
    clearPrebakedMemo();
    return NextResponse.json({ ...(await status(new Date(Date.now() - 10 * 60_000).toISOString())), cleared });
  } catch (err) {
    return NextResponse.json({ error: String((err as Error)?.message ?? err).slice(0, 200) }, { status: 502 });
  }
}
