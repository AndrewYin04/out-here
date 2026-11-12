import { describe, expect, it } from 'vitest';
import { declutter } from './declutter';
import { priceLabel, seatBadge, startsLabel, walkLabel } from './format';

describe('declutter', () => {
  it('keeps separate pins in place', () => {
    const out = declutter([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }], 48);
    expect(out.get('a')).toEqual({ dx: 0, dy: 0 });
    expect(out.get('b')).toEqual({ dx: 0, dy: 0 });
  });
  it('moves the lower-priority pin off an overlapping one', () => {
    const out = declutter([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 5 }], 48);
    expect(out.get('a')).toEqual({ dx: 0, dy: 0 });
    const b = out.get('b')!;
    const x = 10 + b.dx, y = 5 + b.dy;
    expect(Math.abs(x) >= 48 || Math.abs(y) >= 48).toBe(true);
  });
  it('avoids obstacles and leaves no pair overlapping', () => {
    const pins = Array.from({ length: 12 }, (_, i) => ({ id: String(i), x: i * 3, y: i * 2 }));
    const out = declutter(pins, 40, [{ x: -20, y: -20, w: 40, h: 40 }]);
    const boxes = pins.map((p) => ({ x: p.x + out.get(p.id)!.dx - 20, y: p.y + out.get(p.id)!.dy - 20 }));
    boxes.push({ x: -20, y: -20 });
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      expect(Math.abs(a.x - b.x) >= 40 || Math.abs(a.y - b.y) >= 40).toBe(true);
    }
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
  it('labels seats, price and walking', () => {
    expect(seatBadge(2)).toBe('2 left');
    expect(seatBadge(0)).toBe('Full');
    expect(priceLabel(12)).toBe('Up to $12');
    expect(priceLabel(0)).toBe('Free');
    expect(walkLabel(9)).toBe('9 min walk');
    expect(walkLabel(undefined)).toBeNull();
  });
});
