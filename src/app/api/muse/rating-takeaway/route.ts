// POST /api/muse/rating-takeaway  body: { questId } -> { takeaway: string, byMuse: boolean }
//      The "✨ Muse" line on the rating done screen. Muse (fast model, minimal effort, strict schema)
//      writes it from the viewer's saved rating for this quest, the people they marked yes, and
//      their past "loved" hangouts. Code checks it names nobody else and invents no counts. When
//      Muse fails, times out, or its line fails the check, the route returns the code template with
//      byMuse false, and the client shows it without the "✨ Muse" label. Header x-muse-mode: mock|live|fallback.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { museJSON, reportFallback } from '@/features/muse';
import { HttpError } from '@/features/data/server';
import { body, IdZ, route } from '@/lib/api';
import {
  fallbackTakeaway, TAKEAWAY_JSON_SCHEMA, TakeawayZ, takeawayMessages, validateTakeaway, type TakeawayContext,
} from '@/features/memories/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const Request = z.object({ questId: IdZ });
const first = (name: string) => name.split(' ')[0] ?? name;

export const POST = route(async ({ store, viewer, req }) => {
  const { questId } = await body(req, Request);
  const state = await store.ratingState(viewer.id, questId);
  const rating = state.rating;
  if (!rating) throw new HttpError(409, 'Rate this hangout first.');
  const { quest } = await store.quest(viewer.id, questId);
  const history = (await store.myRatings(viewer.id)).filter((r) => r.questId !== questId && r.verdict === 'loved');
  const yes = state.attendees.filter((p) => state.again.some((a) => a.subjectId === p.id && a.again));
  const ctx: TakeawayContext = {
    verdict: rating.verdict, title: quest.title, venue: quest.venueName, category: quest.category,
    highlights: rating.highlights,
    yesFirstNames: yes.map((p) => first(p.name)),
    otherFirstNames: state.attendees.map((p) => first(p.name)),
    lovedInCategory: history.filter((r) => r.quest.category === quest.category).length,
    lovedWith: yes.map((p) => ({ name: first(p.name), count: history.filter((r) => r.quest.memberIds.includes(p.id)).length }))
      .filter((l) => l.count > 0),
    lovedVenues: [...new Set(history.map((r) => r.quest.venueName))].slice(0, 3),
  };
  const template = fallbackTakeaway(ctx.verdict, ctx.highlights, ctx.yesFirstNames);
  try {
    const res = await museJSON({
      schemaName: 'rating_takeaway', schema: TakeawayZ, jsonSchema: TAKEAWAY_JSON_SCHEMA,
      messages: takeawayMessages(ctx),
      model: 'fast', effort: 'minimal', timeoutMs: 5000, deadline: Date.now() + 6000,
      mock: () => ({ takeaway: template }),
      route: 'muse/rating-takeaway', userId: viewer.id,
      logSignals: {
        verdict: ctx.verdict, chips: ctx.highlights.length, yesCount: ctx.yesFirstNames.length,
        lovedInCategory: ctx.lovedInCategory, lovedWith: ctx.lovedWith.length,
      },
    });
    const line = validateTakeaway(res.data.takeaway, ctx);
    if (line) return NextResponse.json({ takeaway: line, byMuse: true }, { headers: { 'x-muse-mode': res.mock ? 'mock' : 'live', 'x-muse-model': res.model } });
    reportFallback({ route: 'muse/rating-takeaway', step: 'validate', error: 'line named someone or invented a count', userId: viewer.id });
  } catch (err) {
    reportFallback({ route: 'muse/rating-takeaway', step: 'muse', error: String((err as Error)?.message ?? err).slice(0, 200), userId: viewer.id });
  }
  return NextResponse.json({ takeaway: template, byMuse: false }, { headers: { 'x-muse-mode': 'fallback' } });
});
