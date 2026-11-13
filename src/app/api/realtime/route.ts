import { getViewer, subscribe, type RealtimeMessage } from '@/features/data/server';
import { json } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CHANNEL = /^(quest|user|location|walk|thread|post|event|together):[A-Za-z0-9-]{1,64}$|^presence:online$|^quests:new$|^demo:reset$/;

// GET /api/realtime?channels=a,b&as=<handle> -> text/event-stream of { channel, event, payload }
// The in-process fallback for Supabase Broadcast (MemoryStore mode). Payloads carry ids and counts only.
export async function GET(req: Request) {
  try {
    await getViewer(req);
  } catch {
    return json({ error: 'unknown persona' }, 400);
  }
  const channels = (new URL(req.url).searchParams.get('channels') ?? '').split(',').map((c) => c.trim()).filter(Boolean);
  if (channels.length === 0 || channels.length > 200 || channels.some((c) => !CHANNEL.test(c))) {
    return json({ error: 'channels must be a comma list of quest:<id>, user:<id>, thread:<id>, post:<id>, event:<id> or presence:online' }, 400);
  }
  const wanted = new Set(channels);
  const enc = new TextEncoder();
  let unsubscribe = () => {};
  let ping: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (s: string) => {
        try { controller.enqueue(enc.encode(s)); } catch { cleanup(); }
      };
      const cleanup = () => { unsubscribe(); if (ping) clearInterval(ping); };
      send(`retry: 2000\n: connected ${channels.length}\n\n`);
      unsubscribe = subscribe((m: RealtimeMessage) => {
        if (wanted.has(m.channel)) send(`data: ${JSON.stringify(m)}\n\n`);
      });
      ping = setInterval(() => send(': ping\n\n'), 15_000);
      req.signal.addEventListener('abort', () => {
        cleanup();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() { unsubscribe(); if (ping) clearInterval(ping); },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
