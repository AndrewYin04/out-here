type Rect = { left: number; top: number; width: number; height: number };
type Area = { left: number; right: number; top: number; bottom: number };

/** Largest unobstructed part of the map, in map-relative CSS pixels. */
export function museCameraArea(bounds: Rect, panels: (Rect | null | undefined)[], visible?: Rect | null) {
  const safe: Area = {
    left: Math.max(bounds.left + 12, visible?.left ?? bounds.left),
    right: Math.min(bounds.left + bounds.width - 12, visible ? visible.left + visible.width : Infinity),
    top: Math.max(bounds.top + 110, visible?.top ?? bounds.top),
    bottom: Math.min(bounds.top + bounds.height - 24, visible ? visible.top + visible.height - 12 : Infinity),
  };
  let spaces = [safe];
  for (const panel of panels) {
    if (!panel || panel.width <= 0 || panel.height <= 0) continue;
    const next: Area[] = [];
    for (const space of spaces) {
      const l = Math.max(space.left, panel.left - 12), r = Math.min(space.right, panel.left + panel.width + 12);
      const t = Math.max(space.top, panel.top - 12), b = Math.min(space.bottom, panel.top + panel.height + 12);
      if (r <= l || b <= t) { next.push(space); continue; }
      // Keep each possible rectangular camera composition, then choose the largest below.
      next.push({ ...space, right: l }, { ...space, left: r }, { ...space, bottom: t }, { ...space, top: b });
    }
    spaces = next.filter((s) => s.right - s.left >= 80 && s.bottom - s.top >= 80);
  }
  const best = spaces.reduce<Area | null>((best, s) => {
    if (s.right - s.left < 80 || s.bottom - s.top < 80) return best;
    return !best || (s.right - s.left) * (s.bottom - s.top) > (best.right - best.left) * (best.bottom - best.top) ? s : best;
  }, null);
  return best ? { x: (best.left + best.right) / 2 - bounds.left, y: (best.top + best.bottom) / 2 - bounds.top, width: best.right - best.left, height: best.bottom - best.top } : null;
}

/** Camera-space staging keeps the two silhouettes apart from every viewing direction. */
export function museStage(front: boolean): { sideways: number; towardViewer: number; altitude: number } {
  return front ? { sideways: 1.8, towardViewer: 2.15, altitude: 1.05 } : { sideways: 1.55, towardViewer: 0.45, altitude: 0.95 };
}

/** A short visible scene still needs room for the body, headphones, and HTML bubble. */
export function museChatZoom(area: { width: number; height: number }, phone: boolean): number {
  const available = Math.min(area.width * 0.65, area.height * 0.55);
  return Math.min(phone ? 23.55 : 23.8, 23 + Math.log2(Math.max(55, Math.min(140, available)) / 80));
}
