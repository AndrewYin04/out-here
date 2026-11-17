// POST /api/muse/filter  body: { mode: 'explore'|'friends', text? }
//   -> { keep: { id, kind: 'quest'|'friend', reason }[], summary, source: 'muse'|'fallback', total, mode, cached }
// The viewer is the x-persona header. Muse picks which map pins (Explore quests or Friends) match
// what the viewer is looking for; ids outside the candidate list are dropped. Cached 120 s per
// viewer + mode + text.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { UnknownUserError } from '@/features/muse';
import { route } from '@/lib/api';
import { buildStorePlanContext } from '@/features/outhere/server/plan-context';
import { cachedMuseFilter } from '@/features/outhere/server/muse-filter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The Muse call caps itself at 6 s; this is the platform ceiling above it.
export const maxDuration = 15;

const BodyZ = z.object({
  mode: z.enum(['explore', 'friends']),
  text: z.string().trim().max(280).optional(),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
});

export const POST = route(async ({ req, viewer }) => {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'body must be JSON' }, { status: 400 });
  }
  const parsed = BodyZ.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: `${issue?.path.join('.') || 'body'}: ${issue?.message ?? 'invalid'}` }, { status: 400 });
  }
  const body = parsed.data;
  try {
    const ctx = await buildStorePlanContext({ userId: viewer.id, location: body.location ?? null, now: new Date() });
    const out = await cachedMuseFilter({ ctx, mode: body.mode, text: body.text ?? '' });
    return NextResponse.json(out, { headers: { 'x-muse-source': out.source, 'x-muse-mode': out.mode } });
  } catch (err) {
    if (err instanceof UnknownUserError) return NextResponse.json({ error: err.message }, { status: 404 });
    console.error('[muse/filter] failed:', String((err as Error)?.message ?? err).slice(0, 200));
    return NextResponse.json({ error: 'Muse could not filter right now' }, { status: 502 });
  }
});
