import { describe, expect, it } from 'vitest';
import {
  canSubmitOnTime, challengeFor, dateInZone, DEFAULT_WINDOW, formatCountdown, formatMinutesOfDay, phaseOf, PICK_STEP,
  pickSchedule, remainingMs, shiftDate, SIDE_QUESTS, SUBMIT_GRACE_MS, validWindow, zonedTimeToUtc,
} from '@/shared';

describe('challenge pool', () => {
  it('is free, solo-completable and curated', () => {
    expect(SIDE_QUESTS.length).toBeGreaterThanOrEqual(12);
    expect(SIDE_QUESTS.every((q) => q.free && q.solo)).toBe(true);
    expect(SIDE_QUESTS.filter((q) => q.free).length / SIDE_QUESTS.length).toBeGreaterThanOrEqual(0.8);
    expect(new Set(SIDE_QUESTS.map((q) => q.id)).size).toBe(SIDE_QUESTS.length);
    for (const q of SIDE_QUESTS) {
      expect(q.title.length).toBeLessThanOrEqual(24);
      expect(q.minMinutes).toBeLessThanOrEqual(q.maxMinutes);
    }
  });

  it('picks the same challenge for the same date, every time', () => {
    expect(challengeFor('2026-11-12')).toEqual(challengeFor('2026-11-12'));
  });

  it('does not repeat within one full cycle of the pool', () => {
    const ids = Array.from({ length: SIDE_QUESTS.length }, (_, i) => challengeFor(shiftDate('2026-11-01', i)).id);
    expect(new Set(ids).size).toBe(SIDE_QUESTS.length);
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    expect(gcd(PICK_STEP, SIDE_QUESTS.length)).toBe(1);
  });

  it('uses the deadline ranges by kind of task', () => {
    const range = (cat: string) => SIDE_QUESTS.filter((q) => q.category === cat).map((q) => [q.minMinutes, q.maxMinutes]);
    for (const r of range('observe')) expect(r).toEqual([15, 30]);
    for (const r of range('create')) expect(r).toEqual([20, 45]);
    for (const r of range('explore')) expect(r).toEqual([45, 90]);
  });
});

describe('time zones', () => {
  it('maps wall-clock times to UTC on both sides of daylight saving (Los Angeles)', () => {
    // US fall back: Sunday 2026-11-01 at 2 AM. Before: PDT (UTC-7). After: PST (UTC-8).
    expect(zonedTimeToUtc('2026-10-31', 10 * 60, 'America/Los_Angeles').toISOString()).toBe('2026-10-31T17:00:00.000Z');
    expect(zonedTimeToUtc('2026-11-01', 10 * 60, 'America/Los_Angeles').toISOString()).toBe('2026-11-01T18:00:00.000Z');
    // US spring forward: Sunday 2026-03-08 at 2 AM.
    expect(zonedTimeToUtc('2026-03-07', 10 * 60, 'America/Los_Angeles').toISOString()).toBe('2026-03-07T18:00:00.000Z');
    expect(zonedTimeToUtc('2026-03-08', 10 * 60, 'America/Los_Angeles').toISOString()).toBe('2026-03-08T17:00:00.000Z');
  });

  it('handles other zones and the DST change day itself', () => {
    expect(zonedTimeToUtc('2026-10-25', 10 * 60, 'Europe/London').toISOString()).toBe('2026-10-25T10:00:00.000Z'); // GMT after the change
    expect(zonedTimeToUtc('2026-10-24', 10 * 60, 'Europe/London').toISOString()).toBe('2026-10-24T09:00:00.000Z'); // BST before it
    expect(zonedTimeToUtc('2026-06-01', 10 * 60, 'Asia/Kolkata').toISOString()).toBe('2026-06-01T04:30:00.000Z');
  });

  it('puts the date boundary in the viewer\'s zone, not UTC', () => {
    const t = new Date('2026-11-13T07:30:00Z'); // 11:30 PM on Nov 12 in Los Angeles
    expect(dateInZone(t, 'America/Los_Angeles')).toBe('2026-11-12');
    expect(dateInZone(t, 'UTC')).toBe('2026-11-13');
  });

  it('lands a skipped spring-forward wall time just after the gap', () => {
    // 2:30 AM does not exist in Los Angeles on 2026-03-08; it must not move backwards.
    const t = zonedTimeToUtc('2026-03-08', 2 * 60 + 30, 'America/Los_Angeles');
    expect(t.getTime()).toBeGreaterThanOrEqual(new Date('2026-03-08T10:00:00Z').getTime());
  });
});

describe('pickSchedule', () => {
  const challenge = challengeFor('2026-11-12');

  it('puts the whole quest inside the active window, for every roll', () => {
    const date = '2026-11-12';
    const start = zonedTimeToUtc(date, DEFAULT_WINDOW.startMin, DEFAULT_WINDOW.tz).getTime();
    const end = zonedTimeToUtc(date, DEFAULT_WINDOW.endMin, DEFAULT_WINDOW.tz).getTime();
    for (let seed = 0; seed < 400; seed++) {
      let n = seed;
      const rand = (max: number) => { n = (n * 1103515245 + 12345) & 0x7fffffff; return n % max; };
      const s = pickSchedule(date, challenge, DEFAULT_WINDOW, rand);
      expect(s.dropAt.getTime()).toBeGreaterThanOrEqual(start);
      expect(s.deadlineAt.getTime()).toBeLessThanOrEqual(end);
      expect(s.durationMinutes).toBeGreaterThanOrEqual(challenge.minMinutes);
      expect(s.durationMinutes).toBeLessThanOrEqual(challenge.maxMinutes);
      expect(s.deadlineAt.getTime() - s.dropAt.getTime()).toBe(s.durationMinutes * 60_000);
    }
  });

  it('reaches the earliest and latest possible drops', () => {
    const early = pickSchedule('2026-11-12', challenge, DEFAULT_WINDOW, () => 0);
    expect(early.dropAt.toISOString()).toBe('2026-11-12T18:00:00.000Z'); // 10:00 PST
    const late = pickSchedule('2026-11-12', challenge, DEFAULT_WINDOW, (max) => max - 1);
    expect(late.deadlineAt.toISOString()).toBe('2026-11-13T04:00:00.000Z'); // 8:00 PM PST
  });

  it('shortens the duration only when the window is too small', () => {
    const tiny = { startMin: 600, endMin: 720, tz: 'America/Los_Angeles' }; // 2 hours
    const explore = SIDE_QUESTS.find((q) => q.category === 'explore')!;
    const s = pickSchedule('2026-11-12', explore, tiny, (max) => max - 1);
    expect(s.durationMinutes).toBeLessThanOrEqual(120);
    expect(s.deadlineAt.getTime() - s.dropAt.getTime()).toBeLessThanOrEqual(120 * 60_000);
  });

  it('validates windows', () => {
    expect(validWindow(DEFAULT_WINDOW)).toBe(true);
    expect(validWindow({ ...DEFAULT_WINDOW, endMin: DEFAULT_WINDOW.startMin + 60 })).toBe(false); // under 2 hours
    expect(validWindow({ ...DEFAULT_WINDOW, startMin: 1300, endMin: 1400 })).toBe(false); // only 100 minutes
    expect(validWindow({ ...DEFAULT_WINDOW, tz: 'Not/AZone' })).toBe(false);
    expect(validWindow({ startMin: 0, endMin: 1500, tz: 'UTC' })).toBe(false);
  });
});

describe('phases and countdown', () => {
  const drop = { dropAt: '2026-11-12T20:00:00Z', deadlineAt: '2026-11-12T20:30:00Z' };
  const at = (s: string) => new Date(`2026-11-12T${s}Z`);

  it('moves waiting -> active -> expired, and completed wins', () => {
    expect(phaseOf(at('19:59:59'), drop, false)).toBe('waiting');
    expect(phaseOf(at('20:00:00'), drop, false)).toBe('active');
    expect(phaseOf(at('20:29:59'), drop, false)).toBe('active');
    expect(phaseOf(at('20:30:00'), drop, false)).toBe('expired');
    expect(phaseOf(at('21:00:00'), drop, true)).toBe('completed');
  });

  it('accepts a submission up to the deadline plus a short in-flight tolerance, never earlier or later', () => {
    expect(canSubmitOnTime(at('19:59:59'), drop)).toBe(false);
    expect(canSubmitOnTime(at('20:00:00'), drop)).toBe(true);
    const deadline = new Date(drop.deadlineAt).getTime();
    expect(canSubmitOnTime(new Date(deadline + SUBMIT_GRACE_MS - 1), drop)).toBe(true);
    expect(canSubmitOnTime(new Date(deadline + SUBMIT_GRACE_MS), drop)).toBe(false);
  });

  it('never shows negative time', () => {
    expect(remainingMs(at('21:00:00'), drop.deadlineAt)).toBe(0);
    expect(formatCountdown(-5000)).toBe('00:00:00');
    expect(formatCountdown(5_000)).toBe('00:00:05');
    expect(formatCountdown(((1 * 60 + 24) * 60 + 32) * 1000)).toBe('01:24:32');
  });

  it('formats times of day', () => {
    expect(formatMinutesOfDay(600)).toBe('10 AM');
    expect(formatMinutesOfDay(1200)).toBe('8 PM');
    expect(formatMinutesOfDay(12 * 60 + 30)).toBe('12:30 PM');
    expect(formatMinutesOfDay(0)).toBe('12 AM');
  });
});
