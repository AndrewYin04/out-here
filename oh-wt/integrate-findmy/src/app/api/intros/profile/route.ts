// GET /api/intros/profile -> { profile }   PUT /api/intros/profile (partial) -> { profile }
// The viewer's own Intro settings only.
import { z } from 'zod';
import { INTRO_KINDS } from '@/shared';
import { body, route } from '@/lib/api';
import { getIntroProfile, putIntroProfile } from '@/features/intros/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KindZ = z.object({ on: z.boolean().optional(), lookingFor: z.string().max(140).optional() }).strict();
const BodyZ = z.object({
  kinds: z.object(Object.fromEntries(INTRO_KINDS.map((k) => [k, KindZ.optional()])) as Record<(typeof INTRO_KINDS)[number], z.ZodOptional<typeof KindZ>>).partial().strict().optional(),
  datingPrefs: z.object({
    ageMin: z.number().int().min(18).max(99),
    ageMax: z.number().int().min(18).max(99),
    genders: z.array(z.enum(['man', 'woman', 'nonbinary'])).min(1),
  }).strict().nullable().optional(),
  maxKm: z.number().int().min(1).max(500).optional(),
  paused: z.boolean().optional(),
}).strict();

export const GET = route(async ({ viewer, store }) => getIntroProfile(store, viewer.id));

export const PUT = route(async ({ req, viewer, store }) => putIntroProfile(store, viewer.id, await body(req, BodyZ)));
