// Server-side realtime: publish(channel, payload) after every mutation (docs/REALTIME.md).
// Every message goes to the in-process emitter (read by the SSE route /api/realtime); when
// Supabase is configured it is also sent as a Supabase Broadcast over the REST endpoint, batched
// per request.
// Payloads carry ids and counts only.
import { supabaseEnv } from './env';
import { currentScope, type OutboxMessage, type RequestScope } from './request-scope';

export type RealtimeMessage = { channel: string; event: string; payload: Record<string, unknown> };
type Listener = (m: RealtimeMessage) => void;

type Hub = { listeners: Set<Listener>; online: Map<string, number> };
const g = globalThis as unknown as { __outhereRealtime?: Hub };
const hub: Hub = (g.__outhereRealtime ??= { listeners: new Set(), online: new Map() });

export function subscribe(listener: Listener): () => void {
  hub.listeners.add(listener);
  return () => { hub.listeners.delete(listener); };
}

/**
 * Delivers to in-process listeners at once. The Supabase Broadcast copy is queued on the request
 * scope when there is one (a route flushes the queue in one REST call before it responds), and is
 * sent right away otherwise.
 */
export async function publish(channel: string, payload: Record<string, unknown>, event = 'update'): Promise<void> {
  const msg: RealtimeMessage = { channel, event, payload };
  for (const l of hub.listeners) {
    try { l(msg); } catch { /* a broken listener must not break the mutation */ }
  }
  if (!supabaseEnv()) return;
  const scope = currentScope();
  const out: OutboxMessage = { topic: channel, event, payload };
  if (scope) scope.outbox.push(out);
  else await sendBroadcast([out]);
}

/** One Broadcast REST call for many messages. Best effort: never throws. */
export async function sendBroadcast(messages: OutboxMessage[]): Promise<void> {
  const env = supabaseEnv();
  if (!env || messages.length === 0) return;
  try {
    await fetch(`${env.url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: env.serviceKey, authorization: `Bearer ${env.serviceKey}` },
      body: JSON.stringify({ messages: messages.map((m) => ({ ...m, private: false })) }),
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    // The mutation already committed; clients also refetch when the tab regains focus.
  }
}

/** Sends and clears the scope's queued Broadcast messages (called by the route wrapper). */
export async function flushOutbox(scope: RequestScope): Promise<number> {
  const msgs = scope.outbox.splice(0);
  await sendBroadcast(msgs);
  return msgs.length;
}

/** Publishes many messages; never throws. */
export async function publishAll(messages: { channel: string; payload: Record<string, unknown> }[]): Promise<void> {
  await Promise.all(messages.map((m) => publish(m.channel, m.payload)));
}

// ---------- presence (MemoryStore mode: heartbeat route) ----------
const PRESENCE_TTL_MS = 40_000;

export function onlineUserIds(): string[] {
  const cutoff = Date.now() - PRESENCE_TTL_MS;
  for (const [id, at] of hub.online) if (at < cutoff) hub.online.delete(id);
  return [...hub.online.keys()].sort();
}

/** Marks a user online (or offline) and broadcasts presence:online when the set changed. */
export async function heartbeat(userId: string, online = true): Promise<string[]> {
  const before = onlineUserIds().join(',');
  if (online) hub.online.set(userId, Date.now());
  else hub.online.delete(userId);
  const ids = onlineUserIds();
  if (ids.join(',') !== before) {
    const msg: RealtimeMessage = { channel: 'presence:online', event: 'presence', payload: { userIds: ids } };
    for (const l of hub.listeners) {
      try { l(msg); } catch { /* ignore */ }
    }
  }
  return ids;
}
