// Daily Side Quests: the curated challenge pool, the deterministic prompt for a date, the
// randomized per-user drop and deadline (picked once on the server, then persisted), time-zone
// maths that survives daylight saving, and the phase/countdown helpers the UI shares.
// Pure (no I/O, no Date.now): the caller passes `now`, and a random source for scheduling.
import { DEMO_TZ } from './demo';
import { seedId } from './seed/ids';

// ---------------------------------------------------------------- challenge pool
export type SideQuestCategory = 'observe' | 'create' | 'explore' | 'social';

export type SideQuestChallenge = {
  id: string;
  title: string;
  /** One or two short sentences: what to photograph. */
  description: string;
  emoji: string;
  category: SideQuestCategory;
  /** Every challenge can be done alone. */
  solo: true;
  /** Optional line that makes it better with friends; the quest never depends on it. */
  friendTip: string | null;
  /** Allowed completion window, in minutes, by kind of task. */
  minMinutes: number;
  maxMinutes: number;
  /** No purchase needed. Every seeded challenge is free. */
  free: true;
  safety: string | null;
};

/** Deadline ranges by task kind (minutes): observation 15-30, creative 20-45, exploration 45-90, social 60-120. */
const RANGE: Record<SideQuestCategory, [number, number]> = {
  observe: [15, 30], create: [20, 45], explore: [45, 90], social: [60, 120],
};

function c(
  id: string, title: string, description: string, emoji: string, category: SideQuestCategory,
  friendTip: string | null = null, safety: string | null = null,
): SideQuestChallenge {
  const [minMinutes, maxMinutes] = RANGE[category];
  return { id, title, description, emoji, category, solo: true, friendTip, minMinutes, maxMinutes, free: true, safety };
}

/**
 * 15 free, ordinary-place challenges. No spending, no strangers, no private places, no locations
 * in the photo required. The pool length is coprime with PICK_STEP, so prompts never repeat
 * within 15 days.
 */
export const SIDE_QUESTS: SideQuestChallenge[] = [
  c('accidental-art', 'Accidental Art', 'Find something ordinary that looks like art.', '🖼️', 'create', 'Swap photos and guess what the other found.'),
  c('doppelganger', 'The Doppelgänger', 'Photograph two unrelated things that look strangely alike.', '👯', 'create'),
  c('tiny-world', 'Tiny World', 'Make something small look enormous with perspective.', '🔍', 'create', 'Have a friend hold the tiny thing while you shoot.'),
  c('color-hunt', 'Color Hunt', 'Find three things in the same color and line them up.', '🎨', 'observe', 'Race a friend to the best set.'),
  c('hidden-face', 'Hidden Face', 'Find an everyday object that looks like a face.', '😮', 'observe'),
  c('secret-spot', 'Secret Spot', 'Photograph a peaceful place you have never noticed before.', '🌿', 'explore', 'Walk there together and keep the spot secret.', 'Stay on public paths and in daylight areas.'),
  c('unexpected-beauty', 'Unexpected Beauty', 'Find something beautiful in an ordinary place.', '✨', 'observe'),
  c('shadow-play', 'Shadow Play', 'Capture an interesting shadow.', '🌓', 'create', 'Make a shadow puppet together.'),
  c('new-perspective', 'New Perspective', 'Photograph something familiar from an unusual angle.', '📐', 'create'),
  c('something-blue', 'Something Blue', 'Find three interesting blue things around you.', '💙', 'observe'),
  c('look-closer', 'Look Closer', 'Find a tiny detail most people walk past.', '🔎', 'observe'),
  c('leading-lines', 'Follow the Lines', 'Find lines that lead your eye somewhere.', '🛤️', 'create'),
  c('letter-hunt', 'Letter Hunt', 'Spell your first initial using things you find.', '🔤', 'create', 'Spell your names together.'),
  c('double-take', 'Double Take', 'Capture a reflection that tells a story.', '🪞', 'create'),
  c('favorite-ordinary', 'Favorite Ordinary', 'Show the ordinary spot you like most nearby.', '📍', 'explore', 'Bring a friend and see it through their eyes.', 'Public places only.'),
];

/** Odd step, coprime with the pool length: consecutive days jump around the pool, no repeats for 15 days. */
export const PICK_STEP = 4;

/** The calendar date `days` before (negative) or after (positive) a YYYY-MM-DD date. */
export function shiftDate(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days since 1970-01-01 for a YYYY-MM-DD date (calendar arithmetic, no time zone). */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** The shared challenge for a calendar date. Same date, same challenge, for everyone. */
export function challengeFor(date: string): SideQuestChallenge {
  const n = SIDE_QUESTS.length;
  return SIDE_QUESTS[(((dayNumber(date) * PICK_STEP) % n) + n) % n];
}

export function challengeById(id: string): SideQuestChallenge | null {
  return SIDE_QUESTS.find((q) => q.id === id) ?? null;
}

// ---------------------------------------------------------------- time zones
/** Is this a time zone Intl knows? Guards stored/user-supplied zone names. */
export function isTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/** Calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function dateInZone(at: Date, tz: string = DEMO_TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** How far `tz` is ahead of UTC at an instant, in ms (negative west of Greenwich). */
function zoneOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(at);
  const v = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const wall = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour') % 24, v('minute'), v('second'));
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * The UTC instant at which a zone's wall clock reads `date` + `minutes` after midnight.
 * Iterates once so it is right on both sides of a daylight-saving change. A wall time that does
 * not exist (spring forward) lands just after the gap.
 */
export function zonedTimeToUtc(date: string, minutes: number, tz: string = DEMO_TZ): Date {
  const [y, m, d] = date.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, minutes, 0);
  const first = naive - zoneOffsetMs(new Date(naive), tz);
  const second = naive - zoneOffsetMs(new Date(first), tz);
  // The wall time exists when converting back lands on it. If not (a spring-forward gap), the
  // later candidate is the first valid moment after the gap.
  const exists = second + zoneOffsetMs(new Date(second), tz) === naive;
  return new Date(exists ? second : Math.max(first, second));
}

// ---------------------------------------------------------------- active window + scheduling
export type ActiveWindow = { startMin: number; endMin: number; tz: string };

/** 10:00 AM to 8:00 PM local time. Everything outside is quiet hours. */
export const DEFAULT_WINDOW: ActiveWindow = { startMin: 10 * 60, endMin: 20 * 60, tz: DEMO_TZ };
/** The shortest active window a user can choose (so a drop always fits). */
export const MIN_WINDOW_MIN = 120;

/** Validate a window: whole minutes inside one day, at least MIN_WINDOW_MIN long, real time zone. */
export function validWindow(w: ActiveWindow): boolean {
  return Number.isInteger(w.startMin) && Number.isInteger(w.endMin)
    && w.startMin >= 0 && w.endMin <= 24 * 60 && w.endMin - w.startMin >= MIN_WINDOW_MIN && isTimeZone(w.tz);
}

export type Schedule = { dropAt: Date; deadlineAt: Date; durationMinutes: number };

/** Random integer in [0, maxExclusive). The server passes crypto.randomInt; tests pass a fixed one. */
export type Rand = (maxExclusive: number) => number;

/**
 * Pick one drop time and one deadline for a person's day. The drop lies inside the active window
 * and the whole quest (drop + duration) fits inside it, so nothing is ever scheduled in quiet
 * hours. The duration is drawn from the challenge's own range, shortened only if the window is
 * too small. Call once per person per date and persist the result: this is the only place that
 * rolls dice.
 */
export function pickSchedule(date: string, challenge: SideQuestChallenge, window: ActiveWindow, rand: Rand): Schedule {
  const span = window.endMin - window.startMin;
  const duration = Math.min(challenge.minMinutes + rand(challenge.maxMinutes - challenge.minMinutes + 1), span);
  const latestStart = window.endMin - duration;
  const startMin = window.startMin + rand(latestStart - window.startMin + 1);
  const dropAt = zonedTimeToUtc(date, startMin, window.tz);
  return { dropAt, deadlineAt: new Date(dropAt.getTime() + duration * 60_000), durationMinutes: duration };
}

// ---------------------------------------------------------------- phases and countdown
export type SideQuestPhase = 'waiting' | 'active' | 'completed' | 'expired';

/** In-flight tolerance: an upload that started before the deadline may finish a few seconds after. */
export const SUBMIT_GRACE_MS = 10_000;

export function phaseOf(now: Date, drop: { dropAt: Date | string; deadlineAt: Date | string }, completed: boolean): SideQuestPhase {
  if (completed) return 'completed';
  const t = now.getTime();
  if (t < new Date(drop.dropAt).getTime()) return 'waiting';
  return t < new Date(drop.deadlineAt).getTime() ? 'active' : 'expired';
}

/** May the server still accept an on-time photo? Strict deadline plus the in-flight tolerance. */
export function canSubmitOnTime(now: Date, drop: { dropAt: Date | string; deadlineAt: Date | string }): boolean {
  const t = now.getTime();
  return t >= new Date(drop.dropAt).getTime() && t < new Date(drop.deadlineAt).getTime() + SUBMIT_GRACE_MS;
}

/** Milliseconds left, never negative. */
export function remainingMs(now: Date, until: Date | string): number {
  return Math.max(0, new Date(until).getTime() - now.getTime());
}

/** "01:24:32" (hours:minutes:seconds), never negative. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/** "10 AM" / "8:30 PM" for a minutes-after-midnight value. */
export function formatMinutesOfDay(min: number): string {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

// ---------------------------------------------------------------- community board
/**
 * The board's id for a date. A post's target id is a uuid column, so the date maps to a stable
 * uuid (the same date always gives the same id, on every server).
 */
export const sideQuestBoardId = (date: string): string => seedId('sidequest-board', date);

// ---------------------------------------------------------------- entry audience
export const SIDE_QUEST_AUDIENCES = ['only_me', 'community'] as const;
export type SideQuestAudience = (typeof SIDE_QUEST_AUDIENCES)[number];

// ---------------------------------------------------------------- demo controls
/** Demo deadline choices the presenter can pick (seconds). */
export const DEMO_DEADLINES_SEC = [60, 120, 300] as const;
