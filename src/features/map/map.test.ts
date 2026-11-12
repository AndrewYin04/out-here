import { describe, expect, it } from 'vitest';
import { cluster, shortTitle } from './cluster';
import { friendsGoingLine, isSoon, pinTime, priceLabel, seatBadge, startsLabel, walkLabel } from './format';

const box = (x: number, y: number, w = 46, h = 56) => ({ x, y, w, h });

describe('cluster', () => {
  it('keeps separate pins apart', () => {
    const out = cluster([{ id: 'a', box: box(0, 0) }, { id: 'b', box: box(100, 0) }]);
    expect(out.get('a')).toEqual([]);
    expect(out.get('b')).toEqual([]);
  });
  it('folds an overlapping lower-priority pin into the first one', () => {
    const out = cluster([{ id: 'a', box: box(0, 0) }, { id: 'b', box: box(10, 5) }, { id: 'c', box: box(30, 30) }]);
    expect(out.get('a')).toEqual(['b', 'c']);
    expect(out.has('b')).toBe(false);
  });
  it('leaves no two shown pins overlapping', () => {
    const pins = Array.from({ length: 20 }, (_, i) => ({ id: String(i), box: box((i * 37) % 200, (i * 53) % 180) }));
    const out = cluster(pins);
    const shown = pins.filter((p) => out.has(p.id)).map((p) => p.box);
    for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
      const a = shown[i], b = shown[j];
      expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
    }
    const absorbed = [...out.values()].reduce((n, g) => n + g.length, 0);
    expect(shown.length + absorbed).toBe(pins.length);
  });
  it('shortens titles for pin labels', () => {
    expect(shortTitle('Dumplings before the rush')).toBe('Dumplings');
    expect(shortTitle('Thrift walk on Willow')).toBe('Thrift walk');
    expect(shortTitle('Pickup volleyball, need 1')).toBe('Pickup volleyball');
    expect(shortTitle('Ramen run')).toBe('Ramen run');
  });
});

describe('format', () => {
  const base = new Date('2026-11-12T18:00:00Z');
  it('labels start times', () => {
    expect(startsLabel({ startsAt: '2026-11-12T18:25:00Z', endsAt: '2026-11-12T19:25:00Z' }, base)).toBe('Starts in 25 min');
    expect(startsLabel({ startsAt: '2026-11-12T17:30:00Z', endsAt: '2026-11-12T19:15:00Z' }, base)).toBe('Happening now · until 11:15 AM');
    expect(startsLabel({ startsAt: '2026-11-12T20:30:00Z', endsAt: '2026-11-12T21:00:00Z' }, base)).toBe('Starts at 12:30 PM');
    expect(startsLabel({ startsAt: '2026-11-12T16:00:00Z', endsAt: '2026-11-12T17:00:00Z' }, base)).toBe('Ended');
  });
  it('labels pin times and soon plans', () => {
    expect(pinTime({ startsAt: '2026-11-12T18:24:00Z', endsAt: '2026-11-12T19:00:00Z' }, base)).toBe('in 24 min');
    expect(pinTime({ startsAt: '2026-11-12T17:50:00Z', endsAt: '2026-11-12T19:00:00Z' }, base)).toBe('Now');
    expect(pinTime({ startsAt: '2026-11-12T20:30:00Z', endsAt: '2026-11-12T21:00:00Z' }, base)).toBe('12:30 PM');
    expect(isSoon({ startsAt: '2026-11-12T18:30:00Z', endsAt: '2026-11-12T19:00:00Z' }, base)).toBe(true);
    expect(isSoon({ startsAt: '2026-11-12T18:45:00Z', endsAt: '2026-11-12T19:00:00Z' }, base)).toBe(false);
  });
  it('labels seats, price, walking and friends going', () => {
    expect(seatBadge(2)).toBe('2 left');
    expect(seatBadge(0)).toBe('Full');
    expect(priceLabel(12)).toBe('Up to $12');
    expect(priceLabel(0)).toBe('Free');
    expect(walkLabel(9)).toBe('9 min walk');
    expect(walkLabel(undefined)).toBeNull();
    expect(friendsGoingLine([])).toBeNull();
    expect(friendsGoingLine(['Nina Park'])).toBe('Nina Park is going');
    expect(friendsGoingLine(['Nina Park', 'Kai Nakamura'])).toBe('Nina Park and Kai Nakamura are going');
    expect(friendsGoingLine(['Nina Park', 'Kai Nakamura', 'Maya Chen'])).toBe('Nina Park and 2 other friends are going');
  });
});
