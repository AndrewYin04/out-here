// POST /api/intros/:id/pick { drop: ID[] } -> { intro }. A plan request returned 2 or 3 choices;
// the viewer picks this one. The other proposed choices (listed in `drop`) are removed, and the
// pick is the viewer's yes, so only the picked person is asked.
import { z } from 'zod';
import { body, route } from '@/lib/api';
import { pickIntro } from '@/features/intros/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodyZ = z.object({ drop: z.array(z.string().trim().min(1).max(64)).max(3).default([]) }).strict();

export const POST = route<{ id: string }>(async ({ req, viewer, store, params }) => {
  const b = await body(req, BodyZ);
  return pickIntro(store, viewer.id, params.id, b.drop);
});
