// POST /api/muse/create-quest body: { text, location, now? } -> { draft, pitch }
//      One line from the host ("boba after class at 4") becomes a plan draft for the create
//      sheet. Muse (fast model, strict schema) proposes title, emoji, category, time, spots and a
//      place picked from the real places near the pin; code resolves times, checks the place id
//      and clamps numbers (validateDraft). The host reviews and posts; Muse never posts.
//      Headers x-muse-mode: mock|live|fallback, x-muse-model. On a Muse failure the offline
//      heuristic answers (x-muse-mode: fallback) so the form still fills.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { now as demoNow } from '@/shared';
import {
  draftCacheKey, draftMessages, mockDraft, museJSON, nearbyPlaces, RAW_DRAFT_JSON_SCHEMA, RawDraftZ, reportFallback, validateDraft,
  type CreateQuestContext,
} from '@/features/muse';
import { body, LatLngZ, route } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const BodyZ = z.object({
  text: z.string().trim().min(2).max(200),
  location: LatLngZ,
  now: z.string().datetime({ offset: true }).optional(),
});

export const POST = route(async ({ store, viewer, req }) => {
  const b = await body(req, BodyZ);
  const at = b.now ? new Date(b.now) : demoNow();
  const { db } = await store.museContext();
  const ctx: CreateQuestContext = {
    text: b.text, now: at, pin: b.location,
    hostFirstName: viewer.name.split(' ')[0] ?? viewer.name, hostInterests: viewer.interests,
    places: nearbyPlaces(db.places, b.location),
  };
  const routeName = '/api/muse/create-quest';
  try {
    const res = await museJSON({
      schemaName: 'create_quest', schema: RawDraftZ, jsonSchema: RAW_DRAFT_JSON_SCHEMA,
      messages: draftMessages(ctx), model: 'fast', effort: 'minimal',
      mock: () => mockDraft(ctx), route: routeName, userId: viewer.id, deadline: Date.now() + 12_000,
      // Key: persona + normalized sentence + the ordered ids of the places near this pin (+ prompt
      // template); not the clock or the walk labels. A pin with other places nearby goes live.
      // validateDraft re-checks the place id and replaces a pitch that no longer fits it.
      cacheKey: draftCacheKey(ctx),
    });
    return NextResponse.json(validateDraft(res.data, ctx), {
      headers: { 'x-muse-mode': res.mock ? 'mock' : 'live', 'x-muse-model': res.model, 'x-muse-cache': res.cached ? 'hit' : 'miss' },
    });
  } catch (err) {
    const msg = String((err as Error)?.message ?? err).slice(0, 200);
    reportFallback({ route: routeName, step: 'draft', error: msg, userId: viewer.id });
    return NextResponse.json(validateDraft(mockDraft(ctx), ctx), { headers: { 'x-muse-mode': 'fallback' } });
  }
});
