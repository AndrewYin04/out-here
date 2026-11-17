import { formatDemoTime, minutesUntil } from '@/shared';
import type { Quest } from '@/shared';

/** "Starts in 25 min", "Happening now · until 6:15 PM", "Starts at 7:30 PM", or "Ended". */
export function startsLabel(q: Pick<Quest, 'startsAt' | 'endsAt'>, base: Date): string {
  const toStart = minutesUntil(q.startsAt, base);
  const toEnd = minutesUntil(q.endsAt, base);
  if (toEnd <= 0) return 'Ended';
  if (toStart <= 0) return `Happening now · until ${formatDemoTime(q.endsAt)}`;
  if (toStart < 60) return `Starts in ${toStart} min`;
  return `Starts at ${formatDemoTime(q.startsAt)}`;
}

export function seatsLeftOf(q: Pick<Quest, 'capacity' | 'memberIds'>): number {
  return Math.max(q.capacity - q.memberIds.length, 0);
}

/** Seat badge text on a pin: "2 left", "1 left", "Full". */
export function seatBadge(seatsLeft: number): string {
  return seatsLeft > 0 ? `${seatsLeft} left` : 'Full';
}

export function priceLabel(priceMax: number): string {
  return priceMax <= 0 ? 'Free' : `Up to $${Math.round(priceMax)}`;
}

export function walkLabel(minutes: number | undefined): string | null {
  if (minutes === undefined) return null;
  return minutes <= 1 ? '1 min walk' : `${minutes} min walk`;
}

/** Time part of a pin label: "Now", "in 25 min", or the clock time. */
export function pinTime(q: Pick<Quest, 'startsAt' | 'endsAt'>, base: Date): string {
  const toStart = minutesUntil(q.startsAt, base);
  if (toStart <= 0) return 'Now';
  if (toStart < 60) return `in ${toStart} min`;
  return formatDemoTime(q.startsAt);
}

/** Happening now or starting within 30 minutes: the pin gets a green ring. */
export function isSoon(q: Pick<Quest, 'startsAt' | 'endsAt'>, base: Date): boolean {
  return minutesUntil(q.startsAt, base) <= 30 && minutesUntil(q.endsAt, base) > 0;
}

/** "Nina Park is going", "Nina Park and Maya Chen are going", "Nina Park and 2 other friends are going". */
export function friendsGoingLine(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} is going`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are going`;
  const rest = names.length - 1;
  return `${names[0]} and ${rest} other friends are going`;
}
