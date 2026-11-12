// Screen-space placement for map pins so no two pins overlap. Each pin keeps its true point;
// a pin whose spot is taken is drawn a short distance away with a leader line back to it.
// Pins are placed in priority order, so the first ones never move.

export type Box = { x: number; y: number; w: number; h: number };
export type PinInput = { id: string; x: number; y: number };
export type Placement = { dx: number; dy: number };

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const boxAt = (x: number, y: number, size: number): Box => ({ x: x - size / 2, y: y - size / 2, w: size, h: size });

/** Candidate offsets: rings of 12 directions at growing radii, nearest first. */
function candidates(size: number): Placement[] {
  const out: Placement[] = [{ dx: 0, dy: 0 }];
  for (const k of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5]) {
    const r = size * k;
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6 - Math.PI / 2;
      out.push({ dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r) });
    }
  }
  return out;
}

/**
 * Places `pins` (already in priority order) as `size`-px squares around their screen points,
 * avoiding each other and the fixed `obstacles`. Returns the offset for each pin id.
 */
export function declutter(pins: PinInput[], size: number, obstacles: Box[] = []): Map<string, Placement> {
  const placed: Box[] = [...obstacles];
  const result = new Map<string, Placement>();
  const options = candidates(size);
  for (const p of pins) {
    let chosen = options[0];
    for (const o of options) {
      const b = boxAt(p.x + o.dx, p.y + o.dy, size);
      if (!placed.some((q) => overlaps(b, q))) { chosen = o; break; }
    }
    placed.push(boxAt(p.x + chosen.dx, p.y + chosen.dy, size));
    result.set(p.id, chosen);
  }
  return result;
}
