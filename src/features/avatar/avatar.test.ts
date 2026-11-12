import { describe, expect, it } from 'vitest';
import { profileId, PERSONA_HANDLES } from '@/shared';
import { composePixels, hexToRgb } from './compose';
import { AvatarLookZ, lookKey, mockLook, parseLook, PALETTES } from './looks';

describe('mock looks', () => {
  it('gives every persona a valid hand-picked look and is stable for anyone else', () => {
    for (const h of PERSONA_HANDLES) expect(AvatarLookZ.safeParse(mockLook(profileId(h))).success).toBe(true);
    expect(mockLook('someone-else')).toEqual(mockLook('someone-else'));
    expect(AvatarLookZ.safeParse(mockLook('someone-else')).success).toBe(true);
  });

  it('varies across people', () => {
    const keys = new Set(Array.from({ length: 40 }, (_, i) => lookKey(mockLook(`person-${i}`))));
    expect(keys.size).toBeGreaterThan(20);
  });

  it('rejects saved looks with unknown values', () => {
    expect(parseLook({ body: 'masc', skin: 'warm', hair: 'black', top: 'blue', bottoms: 'denim', shoes: 'white' })).not.toBeNull();
    expect(parseLook({ body: 'robot', skin: 'warm', hair: 'black', top: 'blue', bottoms: 'denim', shoes: 'white' })).toBeNull();
    expect(parseLook('nope')).toBeNull();
  });
});

describe('composePixels', () => {
  const colors = {
    skin: hexToRgb(PALETTES.skin[0].hex), hair: [10, 20, 30] as [number, number, number], top: [200, 100, 50] as [number, number, number],
    bottoms: [0, 0, 0] as [number, number, number], shoes: [0, 0, 0] as [number, number, number],
  };
  it('tints area pixels by shade and keeps other pixels and alpha', () => {
    // pixel 0: top area, fully lit (shade 210 = colour itself); pixel 1: detail (id black), keeps shade;
    // pixel 2: transparent.
    const shade = new Uint8ClampedArray([210, 210, 210, 255, 40, 50, 60, 255, 0, 0, 0, 0]);
    const id = new Uint8ClampedArray([0, 0, 255, 255, 0, 0, 0, 255, 0, 0, 0, 0]);
    const out = composePixels(shade, id, colors);
    expect(Array.from(out.slice(0, 4))).toEqual([200, 100, 50, 255]);
    expect(Array.from(out.slice(4, 8))).toEqual([40, 50, 60, 255]);
    expect(out[11]).toBe(0);
  });
  it('darkens tints in shadow', () => {
    const out = composePixels(new Uint8ClampedArray([105, 105, 105, 255]), new Uint8ClampedArray([0, 0, 255, 255]), colors);
    expect(Array.from(out.slice(0, 3))).toEqual([100, 50, 25]);
  });
});
