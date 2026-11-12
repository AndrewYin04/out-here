// Chip placement for the Friends map (pure, unit-tested): in order of distance, then most recently
// updated, each status chip keeps its full text only if its box is clear of every avatar (the
// viewer's included), every chip already placed and the map edge; else it shrinks to its emoji;
// else it is hidden.
import type { FriendPin } from '@/shared/types';

export type ChipMode = 'full' | 'emoji' | 'none';
type Box = { x0: number; y0: number; x1: number; y1: number };

const AVATAR_PX = 42;
const CHIP_H = 26;
const CHIP_GAP = 4;
export const CHIP_MAX_W = 160;

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export function chipText(pin: Pick<FriendPin, 'bubble'>): string | null {
  const b = pin.bubble;
  if (b.thought) return `${b.emoji ? `${b.emoji} ` : ''}${b.thought}`;
  return b.emoji;
}

/** Estimated chip width at 13 px semibold: about 7 px a character, plus padding and the 16 px emoji. */
function chipWidth(pin: Pick<FriendPin, 'bubble'>, mode: ChipMode): number {
  if (mode === 'emoji') return 32;
  const text = pin.bubble.thought ?? '';
  return Math.min(CHIP_MAX_W, 18 + text.length * 7 + (pin.bubble.emoji ? 22 : 0));
}

export type ChipItem = { pin: Pick<FriendPin, 'friend' | 'bubble' | 'distanceKm' | 'updatedAt'>; x: number; y: number };

/**
 * Picks each pin's chip mode so no chip overlaps an avatar (the viewer's included), another chip,
 * or the map edge. (x, y) is the pin's bottom centre in screen pixels.
 */
export function placeChips(
  items: ChipItem[],
  me: { x: number; y: number } | null,
  view: { w: number; h: number },
  emojiOnly: boolean,
): Map<string, ChipMode> {
  const taken: Box[] = items.map(({ x, y }) => ({ x0: x - AVATAR_PX / 2, y0: y - AVATAR_PX, x1: x + AVATAR_PX / 2, y1: y }));
  if (me) taken.push({ x0: me.x - AVATAR_PX / 2, y0: me.y - AVATAR_PX - 18, x1: me.x + AVATAR_PX / 2, y1: me.y });
  const order = [...items].sort((a, b) =>
    a.pin.distanceKm - b.pin.distanceKm || b.pin.updatedAt.localeCompare(a.pin.updatedAt));
  const out = new Map<string, ChipMode>();
  for (const { pin, x, y } of order) {
    const modes: ChipMode[] = [];
    if (pin.bubble.thought && !emojiOnly) modes.push('full');
    if (pin.bubble.emoji) modes.push('emoji');
    let chosen: ChipMode = 'none';
    for (const mode of modes) {
      const w = chipWidth(pin, mode);
      const box = { x0: x - w / 2, y0: y - AVATAR_PX - CHIP_GAP - CHIP_H, x1: x + w / 2, y1: y - AVATAR_PX - CHIP_GAP };
      const inside = box.x0 >= 4 && box.x1 <= view.w - 4 && box.y0 >= 0;
      if (inside && !taken.some((t) => overlaps(t, box))) { chosen = mode; taken.push(box); break; }
    }
    out.set(pin.friend.id, chosen);
  }
  return out;
}
