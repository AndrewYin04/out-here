// POST /api/muse/plan  body: { userId?, text, location?, now? } -> MusePlan (+ meta)
// The viewer is body.userId (profile id or handle), else the x-persona header, else Alex.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { UnknownUserError, plan } from '@/features/muse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The pipeline caps itself at PLAN_BUDGET_MS (9 s); this is the platform ceiling above it.
export const maxDuration = 20;

const BodyZ = z.object({
  userId: z.string().min(1).max(64).optional(),
  text: z.string().trim().min(1, 'text is required').max(280),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
  now: z.string().datetime({ offset: true }).optional(),
});

export async function POST(req: Request) {
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
  const persona = req.headers.get('x-persona')?.trim() || null;
  try {
    const out = await plan({
      text: body.text,
      userId: body.userId ?? persona,
      location: body.location ?? null,
      now: body.now ? new Date(body.now) : undefined,
    });
    return NextResponse.json(
      { ...out.plan, meta: out.meta },
      { headers: { 'x-muse-total-ms': String(out.meta.timings.totalMs), 'x-muse-mode': out.meta.mode, 'x-muse-source': out.meta.source } },
    );
  } catch (err) {
    if (err instanceof UnknownUserError) return NextResponse.json({ error: err.message }, { status: 404 });
    console.error('[muse/plan] failed:', String((err as Error)?.message ?? err).slice(0, 200));
    return NextResponse.json({ error: 'Muse could not make a plan right now' }, { status: 502 });
  }
}
