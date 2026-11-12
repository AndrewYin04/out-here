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
