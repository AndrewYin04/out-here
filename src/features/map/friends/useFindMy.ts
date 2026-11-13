'use client';
// Data hooks and formatting for Find My. Pins refetch when location:<me> receives a message (a
// friend's share changed) and when user:<me> says a friend's availability or friendship changed
// (docs/REALTIME.md); payloads carry ids only.
import { useApi, useViewer } from '@/features/data';
import type { FriendPin, LocationShare } from '@/shared/types';

export function useFriendPins() {
  const { viewer } = useViewer();
  return useApi<{ pins: FriendPin[] }>('/api/locations/friends', [`location:${viewer.id}`, `user:${viewer.id}`], undefined, undefined,
    // Pins show availability and friends only; other user: messages (invites, messages...) change neither.
    (_d, channel, payload) => channel.startsWith('user:') && payload.type !== 'availability' && payload.type !== 'friendship');
}

export function useMyShare() {
  const { viewer } = useViewer();
  return useApi<{ share: LocationShare | null }>('/api/locations/me', [`location:${viewer.id}`], undefined, undefined,
    // location:<me> also carries every friend's move ({id: friendId}); only my own share (changed
    // in another of my tabs) changes this response.
    myShareSkip(viewer.id));
}

/** useMyShare's skip: refetch only for a location message about the viewer's own share. */
export function myShareSkip(viewerId: string) {
  return (_d: unknown, _channel: string, payload: Record<string, unknown>) => payload.id !== viewerId;
}

/** "just now", "3 min ago", "2 hr ago". */
export function updatedAgo(iso: string, nowMs: number = Date.now()): string {
  const min = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  return `${hr} hr ago`;
}

/** "650 m", "1.2 km", "540 km". */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  if (km < 20) return `${km.toFixed(1).replace(/\.0$/, '')} km`;
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

/** "1.2 km · 15 min walk" or "540 km away". */
export function distanceLine(pin: Pick<FriendPin, 'distanceKm' | 'walkingMinutes'>): string {
  if (pin.walkingMinutes === null) return `${formatDistance(pin.distanceKm)} away`;
  return `${formatDistance(pin.distanceKm)} · ${pin.walkingMinutes} min walk`;
}

export const firstName = (name: string) => name.split(' ')[0] ?? name;

/** Width of a desktop side panel (400 px) plus its 16 px inset. */
export const PANEL_PX = 416;

export const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;

/** Map padding that keeps pins clear of an open panel: a side column on desktop, the bottom sheet on mobile. */
export function panelPadding(side: 'left' | 'right' | null): { top: number; bottom: number; left: number; right: number } {
  const zero = { top: 0, bottom: 0, left: 0, right: 0 };
  if (!side) return zero;
  if (isDesktop()) return { ...zero, [side]: PANEL_PX };
  // Phones: the card covers the bottom; the Explore / Friends row covers the top 72 px.
  return { ...zero, top: 72, bottom: Math.round(window.innerHeight * 0.45) };
}

/** Desktop: a floating card 16 px in from the map edges with a 12 px radius, sized to its content. */
export const floatingPanel = (side: 'left' | 'right') =>
  `md:top-4! md:bottom-auto! md:max-h-[calc(100%-32px)]! md:rounded-[12px]! ${side === 'left' ? 'md:left-4!' : 'md:right-4!'}`;
