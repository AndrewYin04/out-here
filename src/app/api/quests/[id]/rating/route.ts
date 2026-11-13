import { z } from 'zod';
import { body, IdZ, route } from '@/lib/api';
import { HANGOUT_HIGHLIGHTS } from '@/shared';
import type { HangoutRating, HangoutRatingState } from '@/shared';

const BodyZ = z.object({
  verdict: z.enum(['loved', 'fine', 'meh']),
  score: z.number().min(0).max(10),
  highlights: z.array(z.enum(HANGOUT_HIGHLIGHTS)).max(HANGOUT_HIGHLIGHTS.length).default([]),
  note: z.string().max(500).optional(),
  photoIds: z.array(IdZ).max(20).optional(),
  again: z.array(z.object({ subjectId: IdZ, again: z.boolean() })).max(50).default([]),
});

// GET /api/quests/:id/rating -> HangoutRatingState (the viewer's own rating and answers only)
export const GET = route<{ id: string }>(async ({ store, viewer, params }): Promise<HangoutRatingState> =>
  store.ratingState(viewer.id, params.id));

// PUT /api/quests/:id/rating body: RateHangoutBody -> { rating } (attendees after start; upsert)
export const PUT = route<{ id: string }>(async ({ store, viewer, params, req }): Promise<{ rating: HangoutRating }> => {
  const b = await body(req, BodyZ);
  return { rating: await store.rateHangout(viewer.id, params.id, b) };
});
