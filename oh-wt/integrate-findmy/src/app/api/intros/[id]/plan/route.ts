// POST /api/intros/:id/plan { action: 'hold' } | { action: 'pick', questId } -> { intro }.
// Muse's quick replies once both people said yes: hold seats for both on the first step's quest
// (409 when it is full or the intro is not connected), or switch to another plan from the card.
import { z } from 'zod';
import { body, route } from '@/lib/api';
import { planIntro } from '@/features/intros/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodyZ = z.discriminatedUnion('action', [
  z.object({ action: z.literal('hold') }).strict(),
  z.object({ action: z.literal('pick'), questId: z.string().min(1).max(64) }).strict(),
]);

export const POST = route<{ id: string }>(async ({ req, viewer, store, params }) => {
  const b = await body(req, BodyZ);
  return planIntro(store, viewer.id, params.id, b);
});
