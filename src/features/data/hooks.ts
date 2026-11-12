'use client';
// React hooks for identity, realtime and data. Realtime uses Supabase Broadcast (public
// channels, publishable key) when the server reports Supabase mode, else the SSE route
// /api/realtime. Either way a message only says "something changed"; hooks refetch via the API.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Crew, Quest } from '@/shared';
import type { FriendAvailabilityResponse, NotificationView, PostView } from '@/shared/api';
import { apiFetch, currentPersona, initPersonaFromUrl, PERSONA_EVENT, setPersona as setPersonaRaw } from './client';
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
    return subscribeChannels(key.split(','), (c, p) => ref.current(c, p));
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
 */
export function useApi<T>(path: string | null, channels: readonly string[] = [], channelsOf?: (data: T) => string[]): ApiState<T> {
  const { handle } = useViewer();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const seq = useRef(0);
  /** fresh: read past the server's snapshot cache (used when a realtime message triggered it). */
  const load = useCallback(async (fresh: boolean) => {
    if (!path) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const d = await apiFetch<T>(path, fresh ? { headers: { [FRESH_HEADER]: '1' } } : {});
      if (n === seq.current) { setData(d); setError(null); }
    } catch (e) {
      if (n === seq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [path]);
  const refetch = useCallback(() => load(true), [load]);
  useEffect(() => { void load(false); }, [load, handle]);
  const derived = data && channelsOf ? channelsOf(data) : [];
  useChannel([...channels, ...derived], () => { void load(true); });
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
