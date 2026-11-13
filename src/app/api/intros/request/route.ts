// POST /api/intros/request { kind, lookingFor?, text?, questId? } -> RoundResult & { none?: true }
// An on-request intro: skips the weekly cap but must still clear the quality bar. `text` is the
// same as `lookingFor` ("someone who likes comics"). With `questId` ("find someone to go to THIS
// plan with") only people free for that plan, within a 25 min walk of it and not already on it
// are considered; the plan is the first step, and on double accept both people join it.
import { z } from 'zod';
import { INTRO_KINDS } from '@/shared';
import { body, route } from '@/lib/api';
import { requestIntro } from '@/features/intros/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BodyZ = z.object({
  kind: z.enum(INTRO_KINDS),
  lookingFor: z.string().trim().max(140).optional(),
  text: z.string().trim().max(140).optional(),
  questId: z.string().trim().min(1).max(64).nullish(),
}).strict();

export const POST = route(async ({ req, viewer, store }) => {
  const b = await body(req, BodyZ);
  const out = await requestIntro(store, viewer.id, b.kind, b.lookingFor || b.text || '', b.questId ?? null);
  return out.intro ? out : { ...out, none: true, message: out.message.startsWith('No great match yet') ? out.message : `No great match yet. ${out.message}` };
});
