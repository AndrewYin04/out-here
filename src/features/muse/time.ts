// Time-window math for Muse, in DEMO_TZ (America/Los_Angeles). Pure code: the model only
// reports what the user said ("40 min", "before 7" -> endClock "19:00"); code turns that
// into ISO instants so the window never depends on model arithmetic.
import { DEMO_TZ } from '../../shared';

export type WallClock = { year: number; month: number; day: number; hour: number; minute: number };

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: DEMO_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Wall-clock fields of `d` in DEMO_TZ. */
export function wallClock(d: Date): WallClock {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour) % 24, minute: Number(p.minute),
  };
}

/** Offset of DEMO_TZ from UTC at instant `ms`, in minutes (PDT = -420, PST = -480). */
function tzOffsetMinutes(ms: number): number {
  const w = wallClock(new Date(ms));
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  return Math.round((asUtc - Math.floor(ms / 60_000) * 60_000) / 60_000);
}

/** The instant whose DEMO_TZ wall clock is the given date and time. */
export function fromWallClock(w: WallClock): Date {
  const guess = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  let ms = guess - tzOffsetMinutes(guess) * 60_000;
  // second pass handles a DST change between the guess and the answer
  ms = guess - tzOffsetMinutes(ms) * 60_000;
  return new Date(ms);
}

/** Today's `HH:MM` in DEMO_TZ relative to `now` (same calendar day). */
export function clockToday(now: Date, hour: number, minute: number): Date {
  const w = wallClock(now);
  return fromWallClock({ ...w, hour, minute });
}

/** Parses "19:00" / "7:30" into hour and minute, or null. */
export function parseClock(s: string | null | undefined): { hour: number; minute: number } | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Next occurrence of a clock time after `now`. "7:00" said at 4 PM means 7 PM; a time that
 * already passed today moves 12 hours (when it is a morning hour) and then to tomorrow.
 */
export function nextClock(now: Date, clock: { hour: number; minute: number }): Date {
  let d = clockToday(now, clock.hour, clock.minute);
  if (d.getTime() <= now.getTime() && clock.hour < 12) {
    d = clockToday(now, clock.hour + 12, clock.minute);
  }
  if (d.getTime() <= now.getTime()) d = new Date(d.getTime() + 24 * 60 * 60_000);
  return d;
}

export type PartOfDay = 'now' | 'afternoon' | 'evening' | 'tonight';

/** What the user said about time, as the parse step reports it. Every field may be null. */
export type TimeExpression = {
  /** Window length: "40 min" -> 40, "an hour" -> 60, "30 min before class" -> 30. */
  durationMinutes: number | null;
  /** Window starts this many minutes from now: "in 20 min" -> 20, "after class" -> 60. */
  startsInMinutes: number | null;
  /** Start clock in 24h "HH:MM", local time: "after 5" -> "17:00". */
  startClock: string | null;
  /** End clock in 24h "HH:MM", local time: "before 7" -> "19:00", "till 6" -> "18:00". */
  endClock: string | null;
  partOfDay: PartOfDay | null;
};

/** Default window length when the user gives no time at all. */
export const DEFAULT_WINDOW_MINUTES = 180;
const MAX_WINDOW_MINUTES = 12 * 60;

/** Resolves a time expression against `now` into an ISO window [start, end). */
export function resolveWindow(t: TimeExpression, now: Date): { windowStart: string; windowEnd: string } {
  const nowMs = now.getTime();
  let start = nowMs;
  if (t.startsInMinutes !== null && t.startsInMinutes > 0) start = nowMs + t.startsInMinutes * 60_000;
  const sc = parseClock(t.startClock);
  if (sc) start = Math.max(nowMs, nextClock(now, sc).getTime());
  if (t.partOfDay === 'evening' || t.partOfDay === 'tonight') {
    start = Math.max(start, clockToday(now, 17, 0).getTime());
  } else if (t.partOfDay === 'afternoon') {
    start = Math.max(start, clockToday(now, 12, 0).getTime());
  }

  let end: number;
  const ec = parseClock(t.endClock);
  if (t.durationMinutes !== null && t.durationMinutes > 0) {
    end = start + t.durationMinutes * 60_000;
  } else if (ec) {
    end = nextClock(now, ec).getTime();
  } else if (t.partOfDay === 'evening' || t.partOfDay === 'tonight') {
    end = clockToday(now, 23, 59).getTime();
  } else if (t.partOfDay === 'afternoon') {
    end = clockToday(now, 18, 0).getTime();
  } else {
    end = start + DEFAULT_WINDOW_MINUTES * 60_000;
  }
  if (end <= start) end = start + 60 * 60_000;
  end = Math.min(end, start + MAX_WINDOW_MINUTES * 60_000);
  return { windowStart: new Date(start).toISOString(), windowEnd: new Date(end).toISOString() };
}

/** Window length in whole minutes. */
export function windowMinutes(windowStart: string, windowEnd: string): number {
  return Math.round((Date.parse(windowEnd) - Date.parse(windowStart)) / 60_000);
}

/** "Thu 4:05 PM" style local label used in prompts. */
export function localLabel(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: DEMO_TZ, weekday: 'short', hour: 'numeric', minute: '2-digit',
  }).format(d);
}
