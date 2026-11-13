import { body, route } from '@/lib/api';
import { HttpError } from '@/features/data/server';
import { beginEncounter, encounterRepository, runEncounter, StartEncounterZ } from '@/features/muse-encounters/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const POST = route(async ({ req, viewer, store }) => {
  const input = await body(req, StartEncounterZ), repo = encounterRepository();
  const { session, created } = await beginEncounter(repo, store, viewer.id, input);
  const encoder = new TextEncoder();
  const controller = new AbortController();
  const abort = () => controller.abort();
  req.signal.addEventListener('abort', abort, { once: true });
  if (req.signal.aborted) abort();
  // A duplicate pending request is read through GET, never executed a second time.
  if (!created && session.status === 'pending') throw new HttpError(409, `Encounter already running: ${session.id}`);
  const stream = new ReadableStream({
    async start(writer) {
      const send = (event: string, data: unknown) => {
        try { writer.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); }
        catch { controller.abort(); }
      };
      try {
        send('session', { id: session.id, mode: session.mode });
        if (!created) for (const event of session.events) send('message', event);
        const done = created ? await runEncounter(session, input.text, store, repo, controller.signal, event => send('message', event)) : session;
        send('result', { status: done.status, result: done.result });
      } finally {
        req.signal.removeEventListener('abort', abort);
        try { writer.close(); } catch { /* disconnected */ }
      }
    },
    cancel() { controller.abort(); },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' } });
});
