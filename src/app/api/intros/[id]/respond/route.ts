// POST /api/intros/:id/respond { accept } -> { intro }. Double opt-in: the chat opens only
// after both people accept. A decline is silent to the other side.
import { z } from 'zod';
import { body, route } from '@/lib/api';
import { respondIntro } from '@/features/intros/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodyZ = z.object({ accept: z.boolean() }).strict();

export const POST = route<{ id: string }>(async ({ req, viewer, store, params }) => {
  const b = await body(req, BodyZ);
  return respondIntro(store, viewer.id, params.id, b.accept);
});
