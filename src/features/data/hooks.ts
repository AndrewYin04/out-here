'use client';
// React hooks for identity, realtime and data. Realtime uses Supabase Broadcast (public
// channels, publishable key) when the server reports Supabase mode, else the SSE route
// /api/realtime. Either way a message only says "something changed"; hooks refetch via the API.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Crew, Quest } from '@/shared';
import type { FriendAvailabilityResponse, NotificationView, PostView } from '@/shared/api';
import { apiFetch, currentPersona, initPersonaFromUrl, PERSONA_EVENT, setPersona as setPersonaRaw } from './client';
import { PERSONAS, personaByHandle, type Persona } from './personas';

// ---------- identity ----------
export function useViewer(): { viewer: Persona; handle: string; setPersona: (handle: string) => void; personas: readonly Persona[] } {
  const [handle, setHandle] = useState<string>('alex');
  useEffect(() => {
    setHandle(initPersonaFromUrl());
    const on = () => setHandle(currentPersona());
    window.addEventListener(PERSONA_EVENT, on);
    return () => window.removeEventListener(PERSONA_EVENT, on);
  }, []);
  const setPersona = useCallback((h: string) => setPersonaRaw(h), []);
  return { viewer: personaByHandle(handle) ?? PERSONAS[0], handle, setPersona, personas: PERSONAS };
}

// ---------- realtime ----------
export type RealtimeConfig = { mode: 'supabase'; url: string; key: string } | { mode: 'sse' };
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

export type ChannelHandler = (channel: string, payload: Record<string, unknown>) => void;

/** Subscribes to realtime channels ("quest:<id>", "user:<id>", ...) while mounted. */
export function useChannel(channels: readonly string[], handler: ChannelHandler): void {
  const ref = useRef(handler);
  useEffect(() => { ref.current = handler; });
  const key = [...new Set(channels.filter(Boolean))].sort().join(',');
  useEffect(() => {
    if (!key) return;
    const names = key.split(',');
    let closed = false;
    let cleanup: () => void = () => {};
    void realtimeConfig().then(async (cfg) => {
      if (closed) return;
      if (cfg.mode === 'supabase') {
        const client = await supabaseClient(cfg.url, cfg.key);
        if (closed) return;
        const subs = names.map((name) => client.channel(name)
          .on('broadcast', { event: 'update' }, (msg) => ref.current(name, (msg.payload ?? {}) as Record<string, unknown>))
          .subscribe());
        cleanup = () => { for (const s of subs) void client.removeChannel(s); };
      } else {
        const es = new EventSource(`/api/realtime?channels=${encodeURIComponent(key)}&as=${encodeURIComponent(currentPersona())}`);
        es.onmessage = (e) => {
          try {
            const m = JSON.parse(e.data) as { channel: string; payload: Record<string, unknown> };
            ref.current(m.channel, m.payload);
          } catch { /* ignore malformed frames */ }
        };
        cleanup = () => es.close();
      }
    });
    return () => { closed = true; cleanup(); };
  }, [key]);
}

/** Ids of people online now. Supabase mode uses Presence; MemoryStore mode a heartbeat route. */
export function useOnline(): Set<string> {
  const { handle, viewer } = useViewer();
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    let stop = false;
    let cleanup: () => void = () => {};
    void realtimeConfig().then(async (cfg) => {
      if (stop) return;
      if (cfg.mode === 'supabase') {
        const client = await supabaseClient(cfg.url, cfg.key);
        if (stop) return;
        const ch = client.channel('presence:online', { config: { presence: { key: viewer.id } } });
        ch.on('presence', { event: 'sync' }, () => {
          const state = ch.presenceState<{ userId: string }>();
          setIds([...new Set(Object.values(state).flat().map((p) => p.userId))]);
        }).subscribe((status) => {
          if (status === 'SUBSCRIBED') void ch.track({ userId: viewer.id });
        });
        cleanup = () => { void client.removeChannel(ch); };
      } else {
        const beat = () => apiFetch<{ userIds: string[] }>('/api/realtime/presence', { method: 'POST' })
          .then((r) => { if (!stop) setIds(r.userIds); }).catch(() => {});
        void beat();
        const t = setInterval(beat, 15_000);
        const es = new EventSource(`/api/realtime?channels=presence:online&as=${encodeURIComponent(handle)}`);
        es.onmessage = (e) => {
          try {
            const m = JSON.parse(e.data) as { channel: string; payload: { userIds?: string[] } };
            if (m.channel === 'presence:online' && Array.isArray(m.payload.userIds)) setIds(m.payload.userIds);
          } catch { /* ignore */ }
        };
        cleanup = () => {
          clearInterval(t);
          es.close();
          void apiFetch('/api/realtime/presence', { method: 'DELETE' }).catch(() => {});
        };
      }
    });
    return () => { stop = true; cleanup(); };
  }, [handle, viewer.id]);
  return useMemo(() => new Set(ids), [ids]);
}

// ---------- data ----------
export type ApiState<T> = { data: T | null; error: string | null; loading: boolean; refetch: () => Promise<void> };

/**
 * GET `path` as the current persona; refetches when the persona changes and when any of
 * `channels` (or the ones `channelsOf(data)` returns) receives a message. `path` null = idle.
 */
export function useApi<T>(path: string | null, channels: readonly string[] = [], channelsOf?: (data: T) => string[]): ApiState<T> {
  const { handle } = useViewer();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const seq = useRef(0);
  const refetch = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const d = await apiFetch<T>(path);
      if (n === seq.current) { setData(d); setError(null); }
    } catch (e) {
      if (n === seq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => { void refetch(); }, [refetch, handle]);
  const derived = data && channelsOf ? channelsOf(data) : [];
  useChannel([...channels, ...derived], () => { void refetch(); });
  return { data, error, loading, refetch };
}

/** Quests near a point; refetches when any listed quest's seats change. */
export function useQuests(center: { lat: number; lng: number } | null, radiusM = 3000): ApiState<{ quests: Quest[] }> {
  const path = center ? `/api/quests?lat=${center.lat}&lng=${center.lng}&radiusM=${radiusM}` : null;
  return useApi<{ quests: Quest[] }>(path, [], (d) => d.quests.map((q) => `quest:${q.id}`));
}

export function useQuest(id: string | null) {
  return useApi<{ quest: Quest; seatsLeft: number; members: unknown[]; viewerIsMember: boolean }>(
    id ? `/api/quests/${id}` : null, id ? [`quest:${id}`] : []);
}

export function useFriendAvailability() {
  const { viewer } = useViewer();
  return useApi<FriendAvailabilityResponse>(`/api/friends/${viewer.id}/availability`, [`user:${viewer.id}`]);
}

export function useInvites() {
  const { viewer } = useViewer();
  return useApi<{ incoming: unknown[]; outgoing: unknown[] }>('/api/invites', [`user:${viewer.id}`]);
}

export function useCrews() {
  return useApi<{ crews: Crew[] }>('/api/crews');
}

export function useNotifications() {
  const { viewer } = useViewer();
  return useApi<{ notifications: NotificationView[]; unread: number }>('/api/notifications', [`user:${viewer.id}`]);
}

export function useFeed() {
  return useApi<{ posts: PostView[]; nextCursor: string | null }>('/api/feed', [], (d) => d.posts.map((p) => `post:${p.id}`));
}
