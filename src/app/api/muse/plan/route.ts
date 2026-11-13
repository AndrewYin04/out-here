// POST /api/muse/plan  body: { userId?, text, location?, now? } -> MusePlan + meta
// The viewer is the x-persona header (getViewer). body.userId is never trusted: when present it
// must name the same person, else 403. The plan uses the live store (store-backed provider).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { walkingMinutes, type PlanStageEvent } from '@/shared';
import { UnknownUserError, getPlanContextProvider, plan, setPlanContextProvider } from '@/features/muse';
import { LIVE_TABLES, route } from '@/lib/api';
import { dropText, type DroppedView } from '@/features/outhere/dropped';
import {
  PlanContextNotRegisteredError, planContextSource, storePlanContextProvider,
} from '@/features/outhere/server/plan-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The pipeline caps itself at PLAN_BUDGET_MS (9 s); this is the platform ceiling above it.
export const maxDuration = 20;

setPlanContextProvider(storePlanContextProvider);

const BodyZ = z.object({
  userId: z.string().min(1).max(64).optional(),
  text: z.string().trim().min(1, 'text is required').max(280),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
  now: z.string().datetime({ offset: true }).optional(),
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
  if (body.userId && body.userId !== viewer.id && body.userId.toLowerCase() !== viewer.handle) {
    return NextResponse.json({ error: 'userId must be the viewer' }, { status: 403 });
  }
  const now = body.now ? new Date(body.now) : new Date();
  // ?stream=1: newline-delimited JSON, one {type:"stage"} line as each pipeline stage finishes, then
  // one {type:"result"} line (the same body and x-muse-* values as the plain response) or {type:"error"}.
  if (new URL(req.url).searchParams.get('stream') === '1') {
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        const line = (o: unknown) => { try { ctrl.enqueue(enc.encode(`${JSON.stringify(o)}\n`)); } catch { /* client went away */ } };
        // Offline rehearsals only (MUSE_MOCK=1): MUSE_STREAM_DELAY_MS spaces the already-finished stage
        // lines out so the view can be watched. It never applies to live Muse and changes no result.
        const delay = process.env.MUSE_MOCK === '1' ? Math.min(3000, Number(process.env.MUSE_STREAM_DELAY_MS) || 0) : 0;
        const pending: unknown[] = [];
        try {
          const r = await run(body, viewer.id, now, (e) => (delay ? pending.push({ type: 'stage', ...e }) : line({ type: 'stage', ...e })));
          for (const p of pending) { await new Promise((ok) => setTimeout(ok, delay)); line(p); }
          line({ type: 'result', body: r.body, headers: r.headers });
        } catch (err) {
          const f = failure(err);
          line({ type: 'error', status: f.status, error: f.error });
        }
        try { ctrl.close(); } catch { /* already closed */ }
      },
    });
    return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
  }
  try {
    const r = await run(body, viewer.id, now);
    return NextResponse.json(r.body, { headers: r.headers });
  } catch (err) {
    const f = failure(err);
    return NextResponse.json({ error: f.error }, { status: f.status });
  }
}, { refresh: LIVE_TABLES });

type Body = z.infer<typeof BodyZ>;

async function run(body: Body, viewerId: string, now: Date, onStage?: (e: PlanStageEvent) => void) {
  {
    const contextSource = await planContextSource();
    const provider = await getPlanContextProvider();
    const context = await provider.getPlanContext({ userId: viewerId, location: body.location ?? null, now });
    const out = await plan({ text: body.text, userId: viewerId, location: body.location ?? null, now, context, onStage });
    const questById = new Map(context.quests.map((q) => [q.id, q]));
    const budgetMax = out.plan.intent.budgetMax;
    const dropped: DroppedView[] = out.meta.dropped.flatMap((d) => {
      const q = questById.get(d.questId);
      if (!q) return [];
      const walkMinutes = walkingMinutes(context.location, q.location);
      return [{
        questId: d.questId, title: d.title, venueName: q.venueName, emoji: q.emoji, reason: d.reason,
        text: dropText(d.reason, { walkMinutes, priceMax: q.priceMax, budgetMax }),
      }];
    });
    // x-muse-source: "fallback" when code answered because a live model step failed, else "muse"
    // (mock mode counts as muse here; x-muse-mode says mock). The UI hides the ✨ Muse label on
    // fallback and on mock, and shows mock text as "Offline".
    const museSource = out.meta.source === 'fallback' ? 'fallback' : 'muse';
    return {
      // origin: the viewer's own starting point, so the composer can share availability from there.
      body: { ...out.plan, meta: { ...out.meta, contextSource, dropped, origin: context.location } },
      headers: {
        'x-muse-total-ms': String(out.meta.timings.totalMs), 'x-muse-mode': out.meta.mode,
        'x-muse-source': museSource, 'x-muse-context': contextSource,
        // which model steps came from muse_cache (real Muse answers stored by the warm-up)
        'x-muse-cache': [out.meta.cache.parse && 'parse', out.meta.cache.rank && 'rank'].filter(Boolean).join(',') || 'none',
      } as Record<string, string>,
    };
  }
}

function failure(err: unknown): { status: number; error: string } {
  if (err instanceof UnknownUserError) return { status: 404, error: err.message };
  if (err instanceof PlanContextNotRegisteredError) return { status: 500, error: err.message };
  console.error('[muse/plan] failed:', String((err as Error)?.message ?? err).slice(0, 200));
  return { status: 502, error: 'Muse could not make a plan right now' };
}
