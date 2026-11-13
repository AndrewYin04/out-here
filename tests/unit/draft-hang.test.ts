import { describe, expect, it } from 'vitest';
import {
  hangPlaces, laClock, mockHang, openThrough, validateHang, type HangContext, type HangPlaceInput,
} from '@/features/muse';
import { DEMO_CENTER, type LatLng } from '@/shared';

// Thu Nov 12 2026, 10:50 AM in Menlo Park (PST = UTC-8)
const NOW = new Date('2026-11-12T18:50:00Z');
const at = (min: number) => new Date(NOW.getTime() + min * 60_000);
const north = (m: number): LatLng => ({ lat: DEMO_CENTER.lat + m / 111_320, lng: DEMO_CENTER.lng });
const allDay = { thu: [['10:00', '22:00']] as [string, string][] };

const place = (id: string, name: string, category: string, meters: number, cost: number, hours = allDay): HangPlaceInput =>
  ({ id, name, category, typicalCostUsd: cost, location: north(meters), hours });

const PLACES: HangPlaceInput[] = [
  place('dumpling', 'Dumpling Den', 'food', 500, 12),
  place('sushi', 'Kaiten Bay', 'food', 400, 26),
  place('far', 'Far Noodles', 'food', 3000, 10),
  place('closed', 'Night Owl Cafe', 'cafe', 300, 6, { thu: [['18:00', '23:00']] }),
  place('park', 'Bayfront Park Overlook', 'park', 700, 0),
];

describe('opening hours', () => {
  it('reads Menlo Park local time', () => {
    expect(laClock(NOW)).toEqual({ day: 'thu', min: 10 * 60 + 50 });
  });
  it('needs the place open for the whole hang', () => {
    expect(openThrough(allDay, at(10), at(70))).toBe(true);
    expect(openThrough({ thu: [['10:00', '11:30']] }, at(10), at(70))).toBe(false);
    expect(openThrough({ fri: [['00:00', '23:59']] }, at(10), at(70))).toBe(false);
  });
});

describe('hangPlaces', () => {
  it('keeps open, walkable, in-budget places, nearest first', () => {
    const got = hangPlaces(PLACES, DEMO_CENTER, north(200), NOW, at(120), 15).map((p) => p.placeId);
    expect(got).toEqual(['dumpling', 'park']); // sushi over budget, far too far, cafe closed
  });
  it('drops places when the shared window is too short to be worth it', () => {
    expect(hangPlaces(PLACES, DEMO_CENTER, north(200), NOW, at(20), null)).toEqual([]);
  });
  it('without a budget the pricier place is allowed', () => {
    expect(hangPlaces(PLACES, DEMO_CENTER, north(200), NOW, at(120), null).map((p) => p.placeId)).toContain('sushi');
  });
});

function ctx(text: string): HangContext {
  return {
    text, now: NOW, until: at(100), budgetMax: 15,
    me: { firstName: 'Alex', interests: ['dumplings'], location: DEMO_CENTER },
    friend: { id: 'maya-id', firstName: 'Maya', interests: ['dumplings'], note: 'craving dumplings', location: north(200) },
    places: hangPlaces(PLACES, DEMO_CENTER, north(200), NOW, at(100), 15),
  };
}

describe('validateHang', () => {
  it('uses Muse’s pick and sets times from the walks and the shared window', () => {
    const c = ctx('hungry');
    const d = validateHang({
      placeId: 'dumpling', title: 'Dumplings before the rush', emoji: '🥟', category: 'food',
      description: 'Grab dumplings.', pitch: 'You both love dumplings.', invite: 'Dumpling Den in 10?',
    }, c)!;
    expect(d.venueName).toBe('Dumpling Den');
    expect(d.title).toBe('Dumplings before the rush');
    expect(d.friendId).toBe('maya-id');
    const start = Date.parse(d.startsAt);
    expect(start).toBeGreaterThanOrEqual(NOW.getTime() + Math.max(d.myWalk, d.theirWalk) * 60_000);
    expect((start / 60_000) % 5).toBe(0);
    expect(Date.parse(d.endsAt)).toBeLessThanOrEqual(at(100).getTime());
    expect(d.priceMax).toBe(12);
  });
  it('never trusts a place Muse made up: falls back to a listed place with plain copy', () => {
    const d = validateHang({
      placeId: 'invented', title: 'Sushi at Fancy Place', emoji: '🍣', category: 'food',
      description: '', pitch: 'Fancy Place is great.', invite: 'Fancy Place?',
    }, ctx('hungry'))!;
    expect(['Dumpling Den', 'Bayfront Park Overlook']).toContain(d.venueName);
    expect(d.title).not.toMatch(/Fancy/);
    expect(d.pitch).not.toMatch(/Fancy/);
    expect(d.invite).not.toMatch(/Fancy/);
  });
  it('returns null when no place is usable', () => {
    expect(validateHang(mockHang({ ...ctx('hungry'), places: [] }), { ...ctx('hungry'), places: [] })).toBeNull();
  });
  it('the offline draft matches the ask', () => {
    expect(mockHang(ctx('a walk outside')).placeId).toBe('park');
    expect(mockHang(ctx('hungry')).placeId).toBe('dumpling');
  });
});
