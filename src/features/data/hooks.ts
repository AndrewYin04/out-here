'use client';
// React hooks for identity, realtime and data. Realtime uses Supabase Broadcast (public
// channels, publishable key) when the server reports Supabase mode, else the SSE route
// /api/realtime. Either way a message only says "something changed"; hooks refetch via the API.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Crew, Quest } from '@/shared';
import type { FriendAvailabilityResponse, NotificationView, PostView } from '@/shared/api';
import { apiFetch, currentPersona, initPersonaFromUrl, PERSONA_EVENT, setPersona as setPersonaRaw } from './client';
import { coalescedFetch } from './coalesce';
import { FRESH_HEADER } from './fresh';
import { subscribeChannels, subscribePresence, type ChannelHandler } from './realtime-client';
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
// Every hook below shares this tab's one connection (realtime-client.ts).
export { realtimeConfig, type RealtimeConfig, type ChannelHandler } from './realtime-client';

/**
 * Subscribes to realtime channels ("quest:<id>", "user:<id>", ...) while mounted. After a
 * reconnect the handler is called once per channel with { resync: true }.
 */
export function useChannel(channels: readonly string[], handler: ChannelHandler): void {
  const ref = useRef(handler);
  useEffect(() => { ref.current = handler; });
  const key = [...new Set(channels.filter(Boolean))].sort().join(',');
  useEffect(() => {
    if (!key) return;
    return subscribeChannels(key.split(','), (c, p, at) => ref.current(c, p, at));
  }, [key]);
}

/** Ids of people online now. Supabase mode uses Presence; MemoryStore mode a heartbeat route. */
export function useOnline(): Set<string> {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => subscribePresence(setIds), []);
  return useMemo(() => new Set(ids), [ids]);
}

// ---------- data ----------
export type ApiState<T> = { data: T | null; error: string | null; loading: boolean; refetch: () => Promise<void> };

/**
 * GET `path` as the current persona; refetches when the persona changes and when any of
 * `channels` (or the ones `channelsOf(data)` returns) receives a message. `path` null = idle.
 *
 * Refetches go through the tab-wide coalescer (coalesce.ts): one message makes one GET per path
 * however many hooks in the tab read that path, and a burst makes one GET plus at most one
 * trailing GET.
 */
export function useApi<T>(
  path: string | null,
  channels: readonly string[] = [],
  channelsOf?: (data: T) => string[],
  /** Optional: apply a realtime payload (ids/counts only) to the current data at once, before the refetch confirms it. */
  patch?: (data: T, channel: string, payload: unknown) => T,
  /** Optional: true when the current data already reflects this message, so no refetch is needed. */
  skip?: (data: T, channel: string, payload: Record<string, unknown>) => boolean,
): ApiState<T> {
  const { handle } = useViewer();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const seq = useRef(0);
  // The newest response applied so far. A burst of realtime messages starts several fetches; a
  // response is shown if it is newer than the last one shown, not only if it is the very last
  // fetch, so a stream of messages cannot hold back data that has already arrived.
  const applied = useRef(0);
  const dataRef = useRef<T | null>(null);
  dataRef.current = data;
  /** fresh: read past the server's snapshot cache (used when a realtime message triggered it). */
  /** since: the message's markArrival(), so hooks woken by the same message share one GET. */
  const load = useCallback(async (fresh: boolean, since?: number) => {
    if (!path) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const key = `${currentPersona()}|${fresh ? 'fresh' : 'plain'}|${path}`;
      // A plain mount load joins a plain fetch already in flight (another hook on the same path).
      const d = await coalescedFetch(key, () => apiFetch<T>(path, fresh ? { headers: { [FRESH_HEADER]: '1' } } : {}), { since, join: !fresh });
      if (n > applied.current) { applied.current = n; setData(d); setError(null); }
    } catch (e) {
      if (n === seq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [path]);
  const refetch = useCallback(() => load(true), [load]);
  // A new path or persona: ignore every fetch still in flight for the old one.
  useEffect(() => { applied.current = seq.current; void load(false); }, [load, handle]);
  const derived = data && channelsOf ? channelsOf(data) : [];
  useChannel([...channels, ...derived], (channel, payload, arrived) => {
    if (patch) setData((prev) => (prev ? patch(prev, channel, payload) : prev));
    const cur = dataRef.current;
    if (skip && cur && !payload.resync && skip(cur, channel, payload)) return;
    void load(true, arrived);
  });
  return { data, error, loading, refetch };
}

/** Quests near a point; refetches when any listed quest's seats change or someone posts a new plan. */
export function useQuests(center: { lat: number; lng: number } | null, radiusM = 3000): ApiState<{ quests: Quest[] }> {
  const path = center ? `/api/quests?lat=${center.lat}&lng=${center.lng}&radiusM=${radiusM}` : null;
  return useApi<{ quests: Quest[] }>(path, ['quests:new'], (d) => d.quests.map((q) => `quest:${q.id}`), undefined,
    // quests:new for a plan already on the map (this tab created it and refetched) needs no reload.
    (d, channel, payload) => channel === 'quests:new' && typeof payload.questId === 'string' && d.quests.some((q) => q.id === payload.questId));
}

export function useQuest(id: string | null) {
  return useApi<{ quest: Quest; seatsLeft: number; members: unknown[]; viewerIsMember: boolean }>(
    id ? `/api/quests/${id}` : null, id ? [`quest:${id}`] : [], undefined,
    // The quest:<id> payload carries the authoritative seat count from the write; show it at once.
    (prev, _channel, payload) => {
      const p = payload as { seatsLeft?: unknown } | null;
      return p && typeof p.seatsLeft === 'number' ? { ...prev, seatsLeft: p.seatsLeft } : prev;
    });
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
