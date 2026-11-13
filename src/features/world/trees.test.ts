import { describe, expect, it } from 'vitest';
import { haversineMeters } from '@/shared';
import { moveMeters } from './math';
import { blockerTest, hash01, inPolygon, nearestOnLines, nearestOpen, placeTrees,streetHeading } from './trees';

const HQ = { lat: 37.4847, lng: -122.1477 };
const square = (c: { lat: number; lng: number }, half: number) => {
  const ne = moveMeters(moveMeters(c, half, 0), half, 90);
  const sw = moveMeters(moveMeters(c, half, 180), half, 270);
  return [[sw.lng, sw.lat], [ne.lng, sw.lat], [ne.lng, ne.lat], [sw.lng, ne.lat], [sw.lng, sw.lat]];
};

describe('hash01', () => {
  it('is stable and in 0..1', () => {
    expect(hash01(3, 4, 1)).toBe(hash01(3, 4, 1));
    for (let i = 0; i < 50; i++) { const h = hash01(i, -i, 2); expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(1); }
  });
});

describe('inPolygon', () => {
  it('respects holes', () => {
    const outer = square(HQ, 100);
    const hole = square(HQ, 20);
    expect(inPolygon(HQ, [outer])).toBe(true);
    expect(inPolygon(HQ, [outer, hole])).toBe(false);
    expect(inPolygon(moveMeters(HQ, 50, 0), [outer, hole])).toBe(true);
    expect(inPolygon(moveMeters(HQ, 300, 0), [outer])).toBe(false);
  });
});

describe('placeTrees', () => {
  const base = { origin: HQ, center: HQ, radiusM: 1000, cap: 500, streets: [], blockers: [] };
  it('leaves open glades between irregular park clusters, all within the park', () => {
    const park = square(HQ, 100); // 200 m × 200 m
    const trees = placeTrees({ ...base, areas: [{ rings: [park], spacing: 20 }] });
    expect(trees.length).toBeGreaterThan(35);
    expect(trees.length).toBeLessThan(90);
    for (const t of trees) expect(inPolygon(t, [park])).toBe(true);
  });
  it('gives the same trees when a park arrives split across two tiles', () => {
    const park = square(HQ, 100);
    const once = placeTrees({ ...base, areas: [{ rings: [park], spacing: 20 }] });
    const twice = placeTrees({ ...base, areas: [{ rings: [park], spacing: 20 }, { rings: [park], spacing: 20 }] });
    expect(twice).toEqual(once);
  });
  it('keeps trees out of buildings and within the radius, nearest first, capped', () => {
    const park = square(HQ, 100);
    const building = square(HQ, 30);
    const trees = placeTrees({ ...base, radiusM: 80, cap: 20, areas: [{ rings: [park], spacing: 10 }], blockers: [[building]] });
    expect(trees).toHaveLength(20);
    for (const t of trees) {
      expect(inPolygon(t, [building])).toBe(false);
      expect(haversineMeters(HQ, t)).toBeLessThanOrEqual(80);
    }
    const d = trees.map((t) => haversineMeters(HQ, t));
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });
  it('lines a street on both sides', () => {
    const a = moveMeters(HQ, 100, 270);
    const b = moveMeters(HQ, 100, 90);
    const trees = placeTrees({ ...base, areas: [], streets: [{ coords: [[a.lng, a.lat], [b.lng, b.lat]], spacing: 20, offset: 8 }] });
    expect(trees.length).toBeGreaterThan(12);
    expect(trees.length).toBeLessThanOrEqual(20);
    const north = trees.filter((t) => t.lat > HQ.lat).length;
    expect(north).toBe(trees.length/2);
  });
});

describe('nearestOpen', () => {
  it('steps out of a building to the closest open ground', () => {
    const building = square(HQ, 30);
    const blocked = blockerTest([[building]]);
    expect(blocked(HQ)).toBe(true);
    const out = nearestOpen(HQ, blocked);
    expect(blocked(out)).toBe(false);
    expect(haversineMeters(HQ, out)).toBeLessThan(40);
    const open = moveMeters(HQ, 100, 0);
    expect(nearestOpen(open, blocked)).toEqual(open);
  });
});

describe('nearestOnLines', () => {
  it('finds the closest point on a street within range', () => {
    const a = moveMeters(moveMeters(HQ, 40, 0), 200, 270);
    const b = moveMeters(moveMeters(HQ, 40, 0), 200, 90);
    const p = nearestOnLines(HQ, [[[a.lng, a.lat], [b.lng, b.lat]]], 100);
    expect(p).not.toBeNull();
    expect(haversineMeters(HQ, p!)).toBeCloseTo(40, 0);
    expect(nearestOnLines(HQ, [[[a.lng, a.lat], [b.lng, b.lat]]], 20)).toBeNull();
  });
});

it('frames the player along a nearby street using the direction closest to the current bearing',()=>{
 const a=moveMeters(HQ,100,270),b=moveMeters(HQ,100,90),line=[[[a.lng,a.lat],[b.lng,b.lat]]];expect(streetHeading(HQ,line,20)).toBeCloseTo(90,0);expect(streetHeading(HQ,line,210)).toBeCloseTo(270,0);expect(streetHeading(moveMeters(HQ,200,0),line,0)).toBeNull();
});
