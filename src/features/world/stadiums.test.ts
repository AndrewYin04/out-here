import { describe, expect, it } from 'vitest';
import { DEMO_CENTER, type Quest } from '@/shared';
import { moveMeters } from './math';
import { MAX_DRAWN_SEATS, seatText, stadiumLabels, stadiumSeats, walkText } from './stadiums';

const quest = (id: string, meters: number, over: Partial<Quest> = {}): Quest => {
  const location = moveMeters(DEMO_CENTER, meters, 90);
  return ({
    id, hostId: 'h', title: `Plan ${id}`, emoji: '🥟', category: 'food', description: '', venueName: 'V',
    location, approxLocation: location, startsAt: '', endsAt: '', capacity: 6, memberIds: ['a', 'b'],
    priceMax: 10, tags: [], status: 'open', isPublic: true, createdAt: '', groupId: null, placeId: null, ...over,
  }) as Quest;
};

describe('stadiumSeats', () => {
  it('draws one seat per spot with the taken ones first', () => {
    const s = stadiumSeats(6, 4);
    expect(s).toHaveLength(6);
    expect(s.filter((x) => x.taken)).toHaveLength(4);
    expect(s.slice(0, 4).every((x) => x.taken)).toBe(true);
  });
  it('spreads seats evenly around the ring', () => {
    expect(stadiumSeats(4, 0).map((x) => x.angle)).toEqual([0, 90, 180, 270]);
  });
  it('uses a second, offset tier past 12 seats', () => {
    const s = stadiumSeats(16, 0);
    expect(s.filter((x) => x.tier === 1)).toHaveLength(4);
    expect(s.find((x) => x.tier === 1)!.angle).toBeCloseTo(45);
  });
  it('caps big plans but keeps an open seat visible while any is open', () => {
    const s = stadiumSeats(100, 99);
    expect(s).toHaveLength(MAX_DRAWN_SEATS);
    expect(s.some((x) => !x.taken)).toBe(true);
    expect(stadiumSeats(100, 1).some((x) => x.taken)).toBe(true);
  });
  it('handles empty and bad input', () => {
    expect(stadiumSeats(0, 0)).toEqual([]);
    expect(stadiumSeats(3, 9).every((x) => x.taken)).toBe(true);
    expect(stadiumSeats(3, -2).some((x) => x.taken)).toBe(false);
  });
});

describe('stadiumLabels', () => {
  it('keeps open plans within range, nearest first, and drops full or done ones', () => {
    const qs = [
      quest('far', 4000), quest('b', 600), quest('a', 200),
      quest('full', 100, { memberIds: ['1', '2', '3', '4', '5', '6'] }),
      quest('done', 100, { status: 'done' }),
    ];
    expect(stadiumLabels(qs, DEMO_CENTER).map((l) => l.id)).toEqual(['a', 'b']);
  });
  it('while walking, only the plan you are heading to keeps a label', () => {
    const qs = [quest('smash', 40), quest('boba', 80)];
    expect(stadiumLabels(qs, DEMO_CENTER, { focusId: 'boba' }).map((l) => l.id)).toEqual(['boba']);
  });
  it('always includes Muse picks and the selected plan, first', () => {
    const qs = [quest('near', 100), quest('pick', 4000), quest('sel', 5000)];
    const out = stadiumLabels(qs, DEMO_CENTER, { picks: ['pick'], selectedId: 'sel', cap: 1 });
    expect(out.map((l) => l.id)).toEqual(['sel', 'pick']);
  });
  it('reports seats left and walking minutes at 80 m/min', () => {
    const [l] = stadiumLabels([quest('a', 800)], DEMO_CENTER);
    expect(l.seatsLeft).toBe(4);
    expect(l.minutes).toBeGreaterThanOrEqual(10);
    expect(l.minutes).toBeLessThanOrEqual(14);
  });
});

describe('label text', () => {
  it('words seats like the quest panel', () => {
    expect(seatText(1)).toBe('Last spot');
    expect(seatText(3)).toBe('3 spots left');
  });
  it('words walking time', () => {
    expect(walkText(0, 10)).toBe('here');
    expect(walkText(0, 100)).toBe('1 min');
    expect(walkText(9, 700)).toBe('9 min');
    expect(walkText(65, 5000)).toBe('1 hr 5 min');
    expect(walkText(120, 9000)).toBe('2 hr');
  });
});
