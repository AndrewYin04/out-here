// Screen-space clustering for map pins. Pins are taken in priority order; a pin whose box
// overlaps a pin already shown joins that pin's group instead of being drawn. The shown pin
// then carries a "+N" bubble, and tapping the bubble zooms in until the group splits apart.

export type Box = { x: number; y: number; w: number; h: number };
export type PinInput = { id: string; box: Box };

export const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Each shown pin id mapped to the ids it absorbed (in input order). Absorbed pins are not keys. */
export function cluster(pins: PinInput[]): Map<string, string[]> {
  const shown: PinInput[] = [];
  const groups = new Map<string, string[]>();
  for (const p of pins) {
    const hit = shown.find((s) => overlaps(s.box, p.box));
    if (hit) groups.get(hit.id)!.push(p.id);
    else {
      shown.push(p);
      groups.set(p.id, []);
    }
  }
  return groups;
}

const STOP = new Set(['along', 'on', 'at', 'in', 'before', 'after', 'the', 'a', 'and', '+', '&', 'with', 'for', 'to', 'of']);

/** Short pin label from a plan title: "Dumplings before the rush" -> "Dumplings". */
export function shortTitle(title: string, max = 18): string {
  const words = title.replace(/[,:;.!]/g, ' ').split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    const next = [...out, w].join(' ');
    if (out.length > 0 && next.length > max) break;
    out.push(w);
  }
  while (out.length > 1 && STOP.has(out[out.length - 1].toLowerCase())) out.pop();
  return out.join(' ');
}
