'use client';
// Data hooks and formatting for Find My. Pins refetch when user:<me> receives a message
// (a friend's share changed, see docs/REALTIME.md); payloads carry ids only.
import { useApi, useViewer } from '@/features/data';
import type { FriendPin, LocationShare } from '@/shared/types';

export function useFriendPins() {
  const { viewer } = useViewer();
  return useApi<{ pins: FriendPin[] }>('/api/locations/friends', [`user:${viewer.id}`]);
}

export function useMyShare() {
  const { viewer } = useViewer();
  return useApi<{ share: LocationShare | null }>('/api/locations/me', [`user:${viewer.id}`]);
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
