// The independent light strands around the main ribbon. Each filament has its own lateral
// offset, wobble, drift, lifetime and tint, so they never line up or move in step. Deterministic
// from a seed (one Muse looks the same every time) and pure (unit-tested).
import { mulberry32 } from '@/shared';

export type FilamentSpec = {
  /** Resting sideways offset, in units of the ribbon width (signed, uneven on purpose). */
  base: number;
  /** Wobble amplitude, same units. */
  amp: number;
  /** Wobble cycles along the wake. */
  freq: number;
  phase: number;
  /** Wobble drift, radians per second (signed). */
  drift: number;
  /** Depth wobble (toward / away from the camera). */
  lift: number;
  /** This strand's lifetime relative to the path lifetime, so they fade at different times. */
  lifeScale: number;
  /** Half width relative to the main ribbon. */
  width: number;
  alpha: number;
  /** 0 electric blue .. 1 cyan. */
  tint: number;
  /** How much this strand fans out on tight turns. */
  fan: number;
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function makeFilaments(seed: string, count: number): FilamentSpec[] {
  const rnd = mulberry32(hash(`filaments:${seed}`));
  const r = (a: number, b: number) => a + (b - a) * rnd();
  const out: FilamentSpec[] = [];
  for (let k = 0; k < count; k++) {
    // Uneven offsets: some near the core (overlapping it), some well outside, alternating sides.
    const side = k % 2 === 0 ? 1 : -1;
    const reach = Math.pow(rnd(), 0.8);
    out.push({
      base: side * (0.25 + reach * 2.4),
      amp: r(0.35, 1.5),
      freq: r(0.55, 2.4),
      phase: r(0, Math.PI * 2),
      drift: (rnd() < 0.5 ? -1 : 1) * r(0.5, 2.1),
      lift: r(0.2, 1.1),
      lifeScale: r(0.7, 1.08),
      width: r(0.2, 0.5),
      alpha: r(0.45, 0.95),
      tint: rnd() < 0.45 ? r(0.7, 1) : r(0, 0.4),
      fan: r(0.4, 1.4),
    });
  }
  return out;
}

/**
 * A filament's offset from the main path at path fraction `u` and normalised age `ageN` (0 new,
 * 1 gone): sideways `dx` and toward-the-camera `dy`, in ribbon-width units. Strands start close
 * and disperse as they age; `turn` (0..1) fans them outward near tight turns.
 */
export function filamentOffset(f: FilamentSpec, u: number, ageN: number, time: number, spread: number, turn: number, out = { dx: 0, dy: 0 }): { dx: number; dy: number } {
  const s = f.freq * u * Math.PI * 2 + f.phase + time * f.drift;
  const grow = 0.3 + 1.4 * ageN;
  const fan = 1 + turn * 0.9 * f.fan;
  // A second, slower bend breaks up the identical sine-wave rhythm without noise textures.
  out.dx = (f.base * 0.55 + f.amp * (Math.sin(s) + .18 * Math.sin(s * .47 + f.phase))) * grow * spread * fan;
  out.dy = f.lift * Math.sin(s * 0.8 + 1.7) * grow * spread * 0.7;
  return out;
}
