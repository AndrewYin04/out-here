// POST /api/intros/request { kind, lookingFor } -> RoundResult & { none?: true }
// An on-request intro: skips the weekly cap but must still clear the quality bar.
import { z } from 'zod';
import { INTRO_KINDS } from '@/shared';
import { body, route } from '@/lib/api';
import { requestIntro } from '@/features/intros/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BodyZ = z.object({ kind: z.enum(INTRO_KINDS), lookingFor: z.string().trim().max(140).default('') }).strict();

export const POST = route(async ({ req, viewer, store }) => {
  const b = await body(req, BodyZ);
  const out = await requestIntro(store, viewer.id, b.kind, b.lookingFor);
  return out.intro ? out : { ...out, none: true, message: out.message.startsWith('No great match yet') ? out.message : `No great match yet. ${out.message}` };
});
