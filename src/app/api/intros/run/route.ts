// POST /api/intros/run { kind? } -> RoundResult. Runs one automatic round for the viewer
// (runIntroRound); the /intros page exposes it as a demo control. Obeys the weekly cap.
import { z } from 'zod';
import { INTRO_KINDS } from '@/shared';
import { body, route } from '@/lib/api';
import { runIntroRound } from '@/features/intros/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BodyZ = z.object({ kind: z.enum(INTRO_KINDS).optional() }).strict();

export const POST = route(async ({ req, viewer, store }) => {
  const b = await body(req, BodyZ);
  return runIntroRound(store, viewer.id, b.kind);
});
