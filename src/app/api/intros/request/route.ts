// POST /api/intros/request { kind?, lookingFor?, text?, questId? } -> RoundResult & { none?: true }
// An on-request intro: skips the weekly cap but must still clear the quality bar. `text` is the
// same as `lookingFor` ("someone who likes comics"). With `questId` ("find someone to go to THIS
// plan with") only people free for that plan, within a 25 min walk of it and not already on it
// are considered; the plan is the first step, and on double accept both people join it. The
// typed text is an extra fact and never replaces the saved looking-for. For a plan, `kind` is
// optional: Muse tries every kind the viewer has on, and with 2 or 3 matches it returns `choices`
// (POST /api/intros/:id/pick picks one).
import { z } from 'zod';
import { INTRO_KINDS } from '@/shared';
import { body, route } from '@/lib/api';
import { badRequest } from '@/features/data/server';
import { requestIntro } from '@/features/intros/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BodyZ = z.object({
  kind: z.enum(INTRO_KINDS).nullish(),
  lookingFor: z.string().trim().max(140).optional(),
  text: z.string().trim().max(140).optional(),
  questId: z.string().trim().min(1).max(64).nullish(),
}).strict();

export const POST = route(async ({ req, viewer, store }) => {
  const b = await body(req, BodyZ);
  if (!b.kind && !b.questId) throw badRequest('kind is required unless questId is set');
  const out = await requestIntro(store, viewer.id, b.kind ?? null, b.lookingFor || b.text || '', b.questId ?? null);
  return out.intro || out.choices?.length ? out : { ...out, none: true, message: out.message.startsWith('No great match yet') ? out.message : `No great match yet. ${out.message}` };
});
