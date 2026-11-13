'use client';
// One realtime connection per tab, shared by every useChannel/useOnline in it.
//
// - Supabase mode: one RealtimeChannel per channel name, reference-counted. realtime-js returns
//   the same channel object for a topic that is already open, so a per-hook removeChannel would
//   tear down the channel under every other hook listening on that name. Here the channel is
//   removed only when its last listener leaves (after a short grace period, so a remount reuses
//   it). Presence uses one tracked presence:online channel whose state every useOnline reads.
// - SSE mode (MemoryStore): one EventSource for the union of all channel names plus
//   presence:online. HTTP/1.1 allows 6 connections per host across all tabs, so one stream per
//   hook would stall every later fetch. When the union changes, a new stream opens and the old one
//   closes once the new one is connected, so no message is lost in between.
//
// After a reconnect (SSE error, or a Supabase channel that re-subscribes) every handler gets one
// call with payload { resync: true }, so data hooks refetch whatever they may have missed.
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { apiFetch, currentPersona, PERSONA_EVENT } from './client';
import { markArrival } from './coalesce';
import { personaByHandle } from './personas';

export type RealtimeConfig = { mode: 'supabase'; url: string; key: string } | { mode: 'sse' };
/** `arrived`: one markArrival() per message, shared by every handler it reaches (see coalesce.ts). */
export type ChannelHandler = (channel: string, payload: Record<string, unknown>, arrived: number) => void;

export const PRESENCE_CHANNEL = 'presence:online';
const REMOVE_GRACE_MS = 1500;
const RECONNECT_DEBOUNCE_MS = 30;
const HEARTBEAT_MS = 15_000;

let configPromise: Promise<RealtimeConfig> | null = null;
export function realtimeConfig(): Promise<RealtimeConfig> {
  configPromise ??= fetch('/api/realtime/config').then((r) => r.json() as Promise<RealtimeConfig>).catch(() => ({ mode: 'sse' as const }));
  return configPromise;
}

let supa: Promise<SupabaseClient> | null = null;
function supabaseClient(url: string, key: string): Promise<SupabaseClient> {
  supa ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  return supa;
}

// ---------- registry ----------
const handlers = new Map<string, Set<ChannelHandler>>();
const presenceListeners = new Set<(ids: string[]) => void>();
let onlineIds: string[] = [];

function fanout(channel: string, payload: Record<string, unknown>) {
  const arrived = markArrival();
  for (const h of [...(handlers.get(channel) ?? [])]) {
    try { h(channel, payload, arrived); } catch { /* one handler must not break the others */ }
  }
}

function setOnline(ids: string[]) {
  onlineIds = [...new Set(ids)].sort();
  for (const l of [...presenceListeners]) l(onlineIds);
}

/** Adds a handler to each channel name; returns the matching unsubscribe. */
export function subscribeChannels(names: readonly string[], handler: ChannelHandler): () => void {
  const list = [...new Set(names.filter(Boolean))];
  for (const n of list) {
    let set = handlers.get(n);
    if (!set) handlers.set(n, (set = new Set()));
    set.add(handler);
  }
  schedule();
  return () => {
    for (const n of list) {
      const set = handlers.get(n);
      if (!set) continue;
      set.delete(handler);
      if (set.size === 0) handlers.delete(n);
    }
    schedule();
  };
}

/** Subscribes to the online set; the current set is delivered at once. */
export function subscribePresence(listener: (ids: string[]) => void): () => void {
  presenceListeners.add(listener);
  listener(onlineIds);
  schedule();
  return () => {
    presenceListeners.delete(listener);
    schedule();
  };
}

/** For tests and debugging: what this tab is connected to. */
export function realtimeDebug() {
  return {
    channels: [...handlers.keys()].sort(),
    presence: presenceListeners.size,
    sse: sse ? { channels: sse.channels, open: sse.es.readyState } : null,
    supabase: [...supaChannels.keys()].sort(),
  };
}

let scheduled = false;
function schedule() {
  if (scheduled || typeof window === 'undefined') return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    void realtimeConfig().then((cfg) => (cfg.mode === 'supabase' ? reconcileSupabase(cfg) : reconcileSse()));
  }, RECONNECT_DEBOUNCE_MS);
}

// ---------- SSE mode ----------
type Sse = { es: EventSource; channels: string; persona: string };
let sse: Sse | null = null;
let pending: Sse | null = null;
let beatTimer: ReturnType<typeof setInterval> | null = null;
let beatPersona: string | null = null;

function openSse(channels: string, persona: string): Sse {
  const es = new EventSource(`/api/realtime?channels=${encodeURIComponent(channels)}&as=${encodeURIComponent(persona)}`);
  const conn: Sse = { es, channels, persona };
  let opened = false;
  es.onopen = () => {
    if (pending === conn) {
      // swap: the new stream is live, close the old one
      sse?.es.close();
      sse = conn;
      pending = null;
    }
    if (opened) for (const n of channels.split(',')) fanout(n, { resync: true });
    opened = true;
  };
  es.onmessage = (e) => {
    try {
      const m = JSON.parse(e.data) as { channel: string; payload: Record<string, unknown> };
      // During a swap both streams are open: the old one delivers its channels, the new one only
      // the channels the old one lacks, so nothing is lost and nothing arrives twice.
      if (conn !== sse && !(conn === pending && sse && !sse.channels.split(',').includes(m.channel))) return;
      if (m.channel === PRESENCE_CHANNEL) {
        const ids = (m.payload as { userIds?: unknown }).userIds;
        if (Array.isArray(ids)) setOnline(ids.filter((x): x is string => typeof x === 'string'));
      } else fanout(m.channel, m.payload);
    } catch { /* ignore malformed frames */ }
  };
  return conn;
}

function reconcileSse() {
  const names = [...handlers.keys()];
  if (presenceListeners.size > 0) names.push(PRESENCE_CHANNEL);
  const channels = [...new Set(names)].sort().join(',');
  const persona = currentPersona();
  const target = pending ?? sse;
  if (!channels) {
    pending?.es.close();
    sse?.es.close();
    pending = null;
    sse = null;
  } else if (!target || target.channels !== channels || target.persona !== persona) {
    pending?.es.close();
    pending = null;
    const conn = openSse(channels, persona);
    if (sse) pending = conn;
    else sse = conn;
  }
  syncHeartbeat();
}

function beat(method: 'POST' | 'DELETE', persona?: string) {
  const headers = persona ? { 'x-persona': persona } : undefined;
  return apiFetch<{ userIds: string[] }>('/api/realtime/presence', { method, headers, keepalive: method === 'DELETE' })
    .then((r) => { if (method === 'POST' && Array.isArray(r.userIds)) setOnline(r.userIds); })
    .catch(() => {});
}

/** One heartbeat per tab while anything shows presence; persona switches move the dot. */
function syncHeartbeat() {
  const want = presenceListeners.size > 0;
  const persona = currentPersona();
  if (beatPersona && (!want || beatPersona !== persona)) {
    void beat('DELETE', beatPersona);
    beatPersona = null;
  }
  if (!want) {
    if (beatTimer) clearInterval(beatTimer);
    beatTimer = null;
    return;
  }
  if (!beatPersona) {
    beatPersona = persona;
    void beat('POST');
  }
  beatTimer ??= setInterval(() => { void beat('POST'); }, HEARTBEAT_MS);
}

// ---------- Supabase mode ----------
type SupaEntry = { channel: RealtimeChannel; removeTimer: ReturnType<typeof setTimeout> | null; removing: Promise<unknown> | null; subscribedOnce: boolean };
const supaChannels = new Map<string, SupaEntry>();
let presence: { channel: RealtimeChannel; userId: string } | null = null;
let presenceRemoving: Promise<unknown> | null = null;

async function reconcileSupabase(cfg: { url: string; key: string }) {
  const client = await supabaseClient(cfg.url, cfg.key);
  // add channels that gained listeners, cancel pending removals
  for (const name of handlers.keys()) {
    const entry = supaChannels.get(name);
    if (entry) {
      if (entry.removeTimer) { clearTimeout(entry.removeTimer); entry.removeTimer = null; }
      continue;
    }
    const placeholder: SupaEntry = { channel: null as unknown as RealtimeChannel, removeTimer: null, removing: null, subscribedOnce: false };
    supaChannels.set(name, placeholder);
    // a channel for this topic that is still leaving must be gone before channel() is called again
    const prev = removingTopics.get(name);
    if (prev) await prev;
    if (supaChannels.get(name) !== placeholder) continue;
    const ch = client.channel(name)
      .on('broadcast', { event: 'update' }, (msg) => fanout(name, (msg.payload ?? {}) as Record<string, unknown>));
    placeholder.channel = ch;
    ch.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      if (placeholder.subscribedOnce) fanout(name, { resync: true });
      placeholder.subscribedOnce = true;
    });
  }
  // remove channels that lost every listener, after a grace period
  for (const [name, entry] of supaChannels) {
    if (handlers.has(name) || entry.removeTimer || !entry.channel) continue;
    entry.removeTimer = setTimeout(() => {
      if (handlers.has(name) || supaChannels.get(name) !== entry) return;
      supaChannels.delete(name);
      const p = client.removeChannel(entry.channel).catch(() => {});
      removingTopics.set(name, p);
      void p.finally(() => { if (removingTopics.get(name) === p) removingTopics.delete(name); });
    }, REMOVE_GRACE_MS);
  }
  await reconcilePresence(client);
}
const removingTopics = new Map<string, Promise<unknown>>();

async function reconcilePresence(client: SupabaseClient) {
  const want = presenceListeners.size > 0;
  const userId = want ? viewerId() : null;
  if (presence && (!want || presence.userId !== userId)) {
    const old = presence;
    presence = null;
    presenceRemoving = client.removeChannel(old.channel).catch(() => {});
  }
  if (!want || presence || !userId) return;
  if (presenceRemoving) { await presenceRemoving; presenceRemoving = null; }
  if (presence || presenceListeners.size === 0) return;
  const ch = client.channel(PRESENCE_CHANNEL, { config: { presence: { key: userId } } });
  presence = { channel: ch, userId };
  ch.on('presence', { event: 'sync' }, () => {
    const state = ch.presenceState<{ userId: string }>();
    setOnline(Object.values(state).flat().map((p) => p.userId));
  }).subscribe((status) => {
    if (status === 'SUBSCRIBED') void ch.track({ userId });
  });
}

/** Profile id of this tab's persona (presence keys by id). */
function viewerId(): string | null {
  return personaByHandle(currentPersona())?.id ?? null;
}

if (typeof window !== 'undefined') {
  // a persona switch changes the SSE ?as= and the presence identity
  window.addEventListener(PERSONA_EVENT, () => schedule());
  window.addEventListener('pagehide', () => { if (beatPersona) void beat('DELETE', beatPersona); });
}
