import { z } from 'zod';
import { body, IsoZ, query, route } from '@/lib/api';

// GET /api/threads/:id/messages?before -> { messages } (oldest first; marks the thread read)
export const GET = route<{ id: string }>(async ({ store, viewer, params, url }) => {
  const q = query(url, z.object({ before: IsoZ.optional() }));
  return { messages: await store.messages(viewer.id, params.id, q.before ? new Date(q.before).toISOString() : null) };
});

// POST /api/threads/:id/messages body { text } -> { message }
export const POST = route<{ id: string }>(async ({ store, viewer, params, req }) => {
  const b = await body(req, z.object({ text: z.string().trim().min(1).max(4000) }));
  return { message: await store.sendMessage(viewer.id, params.id, b.text) };
});
