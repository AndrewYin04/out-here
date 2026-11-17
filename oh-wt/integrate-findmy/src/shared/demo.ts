import type { LatLng } from './types';

/** Meta HQ, 1 Hacker Way, Menlo Park. Change only this constant to move the demo, then re-seed. */
export const DEMO_CENTER: LatLng = { lat: 37.4847, lng: -122.1477 };
export const DEMO_AREA_LABEL = 'Menlo Park';
/** Render all times in this zone; the database stores timestamptz. */
export const DEMO_TZ = 'America/Los_Angeles';

/** Walking speed and default walking cap used by time-fit. */
export const WALK_METERS_PER_MIN = 80;
export const ROUTE_FACTOR = 1.3;
export const MAX_WALK_MINUTES = 25;

/** The 8 seeded demo personas (isDemoUser = true), in switcher order. */
export const PERSONA_HANDLES = ['alex', 'maya', 'jordan', 'priya', 'sam', 'leo', 'nina', 'kai'] as const;
export type PersonaHandle = (typeof PERSONA_HANDLES)[number];
export const DEMO_DRIVER_HANDLE: PersonaHandle = 'alex';

// ---- Clock ----
// Tests and the seed can pin the clock with setNow(); everything else calls now().
let pinned: Date | null = null;

export function setNow(d: Date | string | null): void {
  pinned = d === null ? null : new Date(d);
}

export function now(): Date {
  return pinned ? new Date(pinned) : new Date();
}

/** ISO string `minutes` after `base` (negative for the past). */
export function minutesFrom(minutes: number, base: Date = now()): string {
  return new Date(base.getTime() + minutes * 60_000).toISOString();
}

/** Whole minutes from `base` until `iso` (negative when `iso` is in the past). */
export function minutesUntil(iso: string, base: Date = now()): number {
  return Math.round((new Date(iso).getTime() - base.getTime()) / 60_000);
}

/** Date `d` with seconds and milliseconds dropped. */
export function floorToMinute(d: Date): Date {
  const out = new Date(d);
  out.setSeconds(0, 0);
  return out;
}

/** Date `d` with minutes, seconds and milliseconds dropped (UTC hour; PT has whole-hour offsets). */
export function floorToHour(d: Date): Date {
  const out = new Date(d);
  out.setMinutes(0, 0, 0);
  return out;
}

/** Calendar date (YYYY-MM-DD) of `d` in DEMO_TZ. */
export function demoDate(d: Date = now()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DEMO_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** "5:15 PM" in DEMO_TZ. */
export function formatDemoTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: DEMO_TZ, hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));
}
