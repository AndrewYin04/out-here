import { z } from 'zod';
import { route } from '@/lib/api';
import { HttpError } from '@/features/data/server';
import { encounterContext, encounterRepository } from '@/features/muse-encounters/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handler = (cancel: boolean) => route<{ id: string }>(async ({ viewer, store, params }) => {
  const id = z.uuid().parse(params.id), repo = encounterRepository();
  let session = await repo.get(id, viewer.id);
  if (!session) throw new HttpError(404, 'Encounter not found.');
  await encounterContext(store, viewer.id, session.recipientId);
  if (session.status === 'pending' && (cancel || session.expiresAt <= new Date().toISOString())) {
    try { session = await repo.save({ ...session, status: cancel ? 'cancelled' : 'timeout', failure: cancel ? 'cancelled' : 'stale_session' }); }
    catch { session = await repo.get(id, viewer.id) ?? session; }
  }
  return { id: session.id, status: session.status, mode: session.mode, events: session.events, result: session.result };
});
export const GET = handler(false);
export const DELETE = handler(true);
