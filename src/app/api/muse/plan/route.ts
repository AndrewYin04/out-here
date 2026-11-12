// POST /api/muse/plan  body: { userId?, text, location?, now? } -> MusePlan + meta
// The viewer is the x-persona header (getViewer). body.userId is never trusted: when present it
// must name the same person, else 403. The plan uses the live store (store-backed provider).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { walkingMinutes } from '@/shared';
import { UnknownUserError, getPlanContextProvider, plan, setPlanContextProvider } from '@/features/muse';
import { route } from '@/lib/api';
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
  try {
    const contextSource = await planContextSource();
    const provider = await getPlanContextProvider();
    const context = await provider.getPlanContext({ userId: viewer.id, location: body.location ?? null, now });
    const out = await plan({ text: body.text, userId: viewer.id, location: body.location ?? null, now, context });
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
    // (mock mode counts as muse here; x-muse-mode says mock). The UI hides the label on fallback.
    const museSource = out.meta.source === 'fallback' ? 'fallback' : 'muse';
    return NextResponse.json(
      { ...out.plan, meta: { ...out.meta, contextSource, dropped } },
      {
        headers: {
          'x-muse-total-ms': String(out.meta.timings.totalMs), 'x-muse-mode': out.meta.mode,
          'x-muse-source': museSource, 'x-muse-context': contextSource,
        },
      },
    );
  } catch (err) {
    if (err instanceof UnknownUserError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof PlanContextNotRegisteredError) return NextResponse.json({ error: err.message }, { status: 500 });
    console.error('[muse/plan] failed:', String((err as Error)?.message ?? err).slice(0, 200));
    return NextResponse.json({ error: 'Muse could not make a plan right now' }, { status: 502 });
  }
});
