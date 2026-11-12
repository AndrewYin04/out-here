import { describe, expect, it } from 'vitest';
import { formatDemoTime } from '@/shared';
import { fromWallClock, mockParse, nextClock, resolveWindow, toMuseIntent, wallClock } from '@/features/muse';

const NOW = new Date('2026-11-12T16:00:00-08:00'); // Thu 4:00 PM PST
const none = { durationMinutes: null, startsInMinutes: null, startClock: null, endClock: null, partOfDay: null };
const mins = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 60_000);

describe('wall clock in America/Los_Angeles', () => {
  it('round-trips PST and PDT dates', () => {
    expect(wallClock(NOW)).toMatchObject({ year: 2026, month: 11, day: 12, hour: 16, minute: 0 });
    expect(fromWallClock({ year: 2026, month: 11, day: 12, hour: 19, minute: 0 }).toISOString()).toBe('2026-11-13T03:00:00.000Z');
    expect(fromWallClock({ year: 2026, month: 7, day: 1, hour: 19, minute: 0 }).toISOString()).toBe('2026-07-02T02:00:00.000Z');
  });

  it('nextClock reads "7:00" at 4 PM as 7 PM and a past evening time as tomorrow', () => {
    expect(formatDemoTime(nextClock(NOW, { hour: 7, minute: 0 }).toISOString())).toBe('7:00 PM');
    const tomorrow = nextClock(NOW, { hour: 15, minute: 0 });
    expect(tomorrow.toISOString()).toBe('2026-11-13T23:00:00.000Z');
  });
});

describe('resolveWindow', () => {
  it('"40 min" is now to now+40', () => {
    const w = resolveWindow({ ...none, durationMinutes: 40 }, NOW);
    expect(w.windowStart).toBe(NOW.toISOString());
    expect(mins(w.windowStart, w.windowEnd)).toBe(40);
  });

  it('"before 7" ends at 7 PM local', () => {
    const w = resolveWindow({ ...none, endClock: '07:00' }, NOW);
    expect(formatDemoTime(w.windowEnd)).toBe('7:00 PM');
    expect(mins(w.windowStart, w.windowEnd)).toBe(180);
  });

  it('"tonight" runs from 5 PM to 11:59 PM', () => {
    const w = resolveWindow({ ...none, partOfDay: 'tonight' }, NOW);
    expect(formatDemoTime(w.windowStart)).toBe('5:00 PM');
    expect(formatDemoTime(w.windowEnd)).toBe('11:59 PM');
  });

  it('"after class" starts an hour out; no time at all gives 3 hours', () => {
    const after = resolveWindow({ ...none, startsInMinutes: 60 }, NOW);
    expect(mins(NOW.toISOString(), after.windowStart)).toBe(60);
    const def = resolveWindow(none, NOW);
    expect(mins(def.windowStart, def.windowEnd)).toBe(180);
  });

  it('an end before the start becomes a one-hour window', () => {
    const w = resolveWindow({ ...none, startClock: '18:00', endClock: '17:00' }, NOW);
    expect(mins(w.windowStart, w.windowEnd)).toBe(60);
  });
});

describe('mockParse', () => {
  it('reads the demo sentence', () => {
    const raw = mockParse('hungry, got like 40 min, under $15', NOW);
    expect(raw).toMatchObject({ understood: true, budgetMax: 15, durationMinutes: 40, activities: ['food'] });
  });

  it('does not read a walking limit as the window', () => {
    const raw = mockParse('ramen, ok walking 30 min', NOW);
    expect(raw.maxWalkMinutes).toBe(30);
    expect(raw.durationMinutes).toBeNull();
  });

  it('"cheap food before 7", "30 min before class", "after class", "tonight"', () => {
    const cheap = toMuseIntent(mockParse('cheap food before 7', NOW), NOW);
    expect(cheap.budgetMax).toBe(15);
    expect(formatDemoTime(cheap.windowEnd)).toBe('7:00 PM');
    const cls = toMuseIntent(mockParse('30 min before class', NOW), NOW);
    expect(mins(cls.windowStart, cls.windowEnd)).toBe(30);
    const after = toMuseIntent(mockParse('boba after class', NOW), NOW);
    expect(mins(NOW.toISOString(), after.windowStart)).toBe(60);
    const tonight = toMuseIntent(mockParse('music tonight', NOW), NOW);
    expect(formatDemoTime(tonight.windowStart)).toBe('5:00 PM');
  });

  it('"I\'m free" is time, "something free" is price', () => {
    expect(mockParse("I'm free for an hour", NOW).budgetMax).toBeNull();
    expect(mockParse('something free in the next hour', NOW).budgetMax).toBe(0);
  });

  it('flags keyboard mash as not understood', () => {
    expect(mockParse('asdfgh', NOW).understood).toBe(false);
  });
});
