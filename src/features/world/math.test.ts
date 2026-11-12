import { describe, expect, it } from 'vitest';
import { haversineMeters } from '@/shared';
import {
  acceptFix, bearingDeg, characterScale, deltaDeg, fixHeading, lerpDeg, minutesLeft, moveMeters, normalizeDeg,
  offsetMeters, pitchForZoom, stepToward, FLAT_ZOOM, STREET_PITCH, STREET_ZOOM, type GpsFix,
} from './math';

const HQ = { lat: 37.4847, lng: -122.1477 };

describe('pitchForZoom', () => {
  it('is flat at city zoom and fully tilted at street zoom', () => {
    expect(pitchForZoom(12)).toBe(0);
    expect(pitchForZoom(FLAT_ZOOM)).toBe(0);
    expect(pitchForZoom(STREET_ZOOM)).toBe(STREET_PITCH);
    expect(pitchForZoom(20)).toBe(STREET_PITCH);
  });
  it('rises smoothly in between', () => {
    const z = [15.5, 16, 16.5, 17, 17.5, 18].map(pitchForZoom);
    for (let i = 1; i < z.length; i++) expect(z[i]).toBeGreaterThan(z[i - 1]);
    expect(pitchForZoom(17)).toBeGreaterThan(30);
    expect(pitchForZoom(17)).toBeLessThan(50);
  });
});

describe('characterScale', () => {
  it('grows as the camera pulls out, capped', () => {
    expect(characterScale(STREET_ZOOM)).toBe(9);
    expect(characterScale(17.5)).toBe(18);
    expect(characterScale(10)).toBe(40);
  });
});

describe('angles', () => {
  it('normalizes and takes the shortest turn', () => {
    expect(normalizeDeg(-90)).toBe(270);
    expect(normalizeDeg(720)).toBe(0);
    expect(deltaDeg(350, 10)).toBe(20);
    expect(deltaDeg(10, 350)).toBe(-20);
    expect(lerpDeg(350, 10, 0.5)).toBeCloseTo(0);
  });
  it('bearing points the right way', () => {
    expect(bearingDeg(HQ, { lat: HQ.lat + 0.01, lng: HQ.lng })).toBeCloseTo(0, 0);
    expect(bearingDeg(HQ, { lat: HQ.lat, lng: HQ.lng + 0.01 })).toBeCloseTo(90, 0);
    expect(bearingDeg(HQ, { lat: HQ.lat - 0.01, lng: HQ.lng })).toBeCloseTo(180, 0);
  });
});

describe('walking', () => {
  it('moveMeters and offsetMeters agree with haversine', () => {
    const p = moveMeters(HQ, 200, 45);
    expect(haversineMeters(HQ, p)).toBeCloseTo(200, -1);
    const o = offsetMeters(HQ, p);
    expect(o.east).toBeCloseTo(141.4, 0);
    expect(o.north).toBeCloseTo(141.4, 0);
  });
  it('stepToward arrives instead of overshooting', () => {
    const target = moveMeters(HQ, 100, 90);
    const a = stepToward(HQ, target, 40);
    expect(a.arrived).toBe(false);
    expect(a.heading).toBeCloseTo(90, 0);
    expect(haversineMeters(a.pos, target)).toBeCloseTo(60, 0);
    const b = stepToward(a.pos, target, 80);
    expect(b.arrived).toBe(true);
    expect(b.pos).toEqual(target);
  });
  it('minutesLeft uses the server walking math, rounded up', () => {
    // 554 m straight line ≈ 9 min at 1.3 route factor and 80 m/min.
    const t = moveMeters(HQ, 554, 0);
    expect(minutesLeft(HQ, t)).toBe(9);
    expect(minutesLeft(HQ, HQ)).toBe(0);
  });
});

describe('GPS fixes', () => {
  const fix = (over: Partial<GpsFix> = {}): GpsFix => ({ ...HQ, accuracy: 10, heading: null, speed: null, at: 0, ...over });
  it('drops inaccurate fixes', () => {
    expect(acceptFix(null, fix({ accuracy: 15 }))).toBe(true);
    expect(acceptFix(null, fix({ accuracy: 120 }))).toBe(false);
  });
  it('drops impossible jumps, keeps walking', () => {
    const start = fix();
    const walked = { ...moveMeters(HQ, 15, 0), accuracy: 10, heading: null, speed: 1.4, at: 10_000 };
    expect(acceptFix(start, walked)).toBe(true);
    const jumped = { ...moveMeters(HQ, 900, 0), accuracy: 10, heading: null, speed: null, at: 10_000 };
    expect(acceptFix(start, jumped)).toBe(false);
  });
  it('accepts a fast move once it repeats (a bike or a car), never a single glitch', () => {
    const start = fix();
    const far = { ...moveMeters(HQ, 400, 0), accuracy: 10, heading: null, speed: null, at: 10_000 };
    expect(acceptFix(start, far, 0)).toBe(false);
    expect(acceptFix(start, far, 2)).toBe(false);
    expect(acceptFix(start, far, 3)).toBe(true);
    expect(acceptFix(start, { ...far, accuracy: 200 }, 5)).toBe(false);
  });
  it('uses the GPS course only while moving', () => {
    expect(fixHeading(fix({ heading: 90, speed: 1.5 }))).toBe(90);
    expect(fixHeading(fix({ heading: 90, speed: 0.1 }))).toBeNull();
    expect(fixHeading(fix({ heading: null }))).toBeNull();
  });
});
