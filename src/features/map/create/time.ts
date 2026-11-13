// Clock-time helpers for the create sheet, in DEMO_TZ (America/Los_Angeles), so a host in any
// browser timezone picks Menlo Park times.
import { DEMO_TZ } from '@/shared';

const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: DEMO_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function wall(d: Date) {
  const p = Object.fromEntries(parts.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: Number(p.year), mo: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, mi: Number(p.minute) };
}

/** "HH:MM" of an instant in DEMO_TZ, for <input type="time">. */
export function clockValue(iso: string): string {
  const w = wall(new Date(iso));
  return `${String(w.h).padStart(2, '0')}:${String(w.mi).padStart(2, '0')}`;
}

/** The next instant at or after `now` (within 24 h) whose DEMO_TZ clock reads `hhmm`. */
export function nextAtClock(hhmm: string, now: Date): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const w = wall(now);
  const guess = Date.UTC(w.y, w.mo - 1, w.d, Number(m[1]), Number(m[2]));
  // DEMO_TZ offset at the guess (PDT -7 h, PST -8 h), measured, so DST is right.
  const g = wall(new Date(guess));
  const offset = Date.UTC(g.y, g.mo - 1, g.d, g.h, g.mi) - guess;
  let at = guess - offset;
  if (at < now.getTime() - 60_000) at += 24 * 60 * 60_000;
  return new Date(at);
}

/** now + minutes, rounded up to the next 5 minutes. 0 means right now (this minute), so a "Now" plan is live at once. */
export function inMinutes(now: Date, minutes: number): Date {
  if (minutes <= 0) return new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const step = 5 * 60_000;
  return new Date(Math.ceil((now.getTime() + minutes * 60_000) / step) * step);
}
