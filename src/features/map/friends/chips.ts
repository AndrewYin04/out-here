// Chip placement for the Friends map (pure, unit-tested): in order of distance, then most recently
// updated, each status chip takes the first mode and side (above the avatar, then below it) whose
// box is clear of every avatar (the viewer's included), every chip already placed and the map
// edge; if none fits, it is hidden. Quest pins are soft obstacles: a chip lies under one only when
// no spot clear of them exists.
// Modes: 'full' is the whole thought (wrapping to 2 lines on desktop), 'short' is the emoji plus
// the first 18 characters and an ellipsis, 'mini' the emoji plus the first 10 characters, 'emoji'
// is the emoji alone.
import type { FriendPin } from '@/shared/types';

export type ChipMode = 'full' | 'short' | 'mini' | 'emoji' | 'none';
export type ChipSide = 'above' | 'below';
/** dx: px the chip is shifted sideways from the pin centre to stay inside the map. */
export type ChipPlacement = { mode: ChipMode; side: ChipSide; dx: number };
export type Box = { x0: number; y0: number; x1: number; y1: number };

const AVATAR_PX = 42;
const LINE_H = 16;
const CHIP_PAD_Y = 10;
const CHIP_GAP = 4;
/** Default chip width cap (one line, truncated). */
export const CHIP_MAX_W = 160;
/** Desktop chips wrap the full thought to 2 lines inside this width. */
export const CHIP_WRAP_W = 200;
/** Characters of the thought a short chip keeps before the ellipsis. */
export const SHORT_CHARS = 18;
/** Characters a mini chip keeps; used on crowded phone maps before a chip is hidden. */
export const MINI_CHARS = 10;

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** The thought cut to SHORT_CHARS characters plus an ellipsis; unchanged when it already fits. */
export function shortThought(thought: string, chars = SHORT_CHARS): string {
  const t = thought.trim();
  return t.length <= chars ? t : `${t.slice(0, chars).trimEnd()}…`;
}

/** The thought text a chip in this mode shows, or null when it shows none. */
export function thoughtFor(thought: string | null | undefined, mode: ChipMode): string | null {
  if (!thought) return null;
  if (mode === 'full') return thought;
  if (mode === 'short') return shortThought(thought);
  if (mode === 'mini') return shortThought(thought, MINI_CHARS);
  return null;
}

export function chipText(pin: Pick<FriendPin, 'bubble'>, mode: ChipMode = 'full'): string | null {
  const b = pin.bubble;
  const t = thoughtFor(b.thought, mode);
  if (t) return `${b.emoji ? `${b.emoji} ` : ''}${t}`;
  return b.emoji;
}

export type ChipOptions = {
  /** Width cap of a full chip; a wider thought wraps when `lines` is above 1. Default CHIP_MAX_W. */
  maxW?: number;
  /** Lines a full chip may wrap to. Default 1. */
  lines?: number;
  /** Modes to try, in order. Default ['full', 'emoji']. */
  modes?: ChipMode[];
  /** Sides to try for each mode, in order. Default ['above']. */
  sides?: ChipSide[];
  /** Shift a chip sideways to keep it inside the map edge instead of rejecting it. Default false. */
  shift?: boolean;
  /** Screen boxes no chip may cover, such as quest pins, so a tap there still reaches the pin. */
  obstacles?: Box[];
};

/** Estimated chip size at 13 px semibold: about 7 px a character, plus padding and the 16 px emoji. */
function chipSize(pin: Pick<FriendPin, 'bubble'>, mode: ChipMode, maxW: number, lines: number): { w: number; h: number } {
  if (mode === 'emoji') return { w: 32, h: LINE_H + CHIP_PAD_Y };
  const text = thoughtFor(pin.bubble.thought, mode) ?? '';
  const natural = 18 + text.length * 7 + (pin.bubble.emoji ? 22 : 0);
  const w = Math.min(maxW, natural);
  const rows = mode === 'full' ? Math.min(lines, Math.max(1, Math.ceil(natural / maxW))) : 1;
  return { w, h: rows * LINE_H + CHIP_PAD_Y };
}

export type ChipItem = { pin: Pick<FriendPin, 'friend' | 'bubble' | 'distanceKm' | 'updatedAt'>; x: number; y: number };

/**
 * Picks each pin's chip mode so no chip overlaps an avatar (the viewer's included), another chip,
 * or the map edge. (x, y) is the pin's bottom centre in screen pixels. `emojiOnly` drops the
 * text modes.
 */
export function placeChips(
  items: ChipItem[],
  me: { x: number; y: number } | null,
  view: { w: number; h: number },
  emojiOnly: boolean,
  opts: ChipOptions = {},
): Map<string, ChipMode> {
  const out = new Map<string, ChipMode>();
  for (const [id, p] of placeChipsSided(items, me, view, emojiOnly, opts)) out.set(id, p.mode);
  return out;
}

/** placeChips, plus the side of the avatar each chip goes on. */
export function placeChipsSided(
  items: ChipItem[],
  me: { x: number; y: number } | null,
  view: { w: number; h: number },
  emojiOnly: boolean,
  opts: ChipOptions = {},
): Map<string, ChipPlacement> {
  const maxW = opts.maxW ?? CHIP_MAX_W;
  const lines = opts.lines ?? 1;
  const tryModes = opts.modes ?? ['full', 'emoji'];
  const sides = opts.sides ?? ['above'];
  const taken: Box[] = items.map(({ x, y }) => ({ x0: x - AVATAR_PX / 2, y0: y - AVATAR_PX, x1: x + AVATAR_PX / 2, y1: y }));
  if (me) taken.push({ x0: me.x - AVATAR_PX / 2, y0: me.y - AVATAR_PX - 18, x1: me.x + AVATAR_PX / 2, y1: me.y });
  // Quest pins are soft: at each chip length, every chip first looks for a spot clear of them, and
  // only a chip with no such spot may lie under one before it is shortened (quest pins draw above
  // friend markers, so the pin stays tappable).
  const soft = opts.obstacles ?? [];
  const order = [...items].sort((a, b) =>
    a.pin.distanceKm - b.pin.distanceKm || b.pin.updatedAt.localeCompare(a.pin.updatedAt));
  const out = new Map<string, ChipPlacement>();
  // With `shift`, every chip tries the first mode before any chip falls back to a shorter one, so
  // a near friend's chip is not shortened to make room for a farther friend's longer one.
  const passes = opts.shift ? tryModes.map((m) => [m]) : [tryModes];
  for (const passModes of passes) for (const strict of soft.length ? [true, false] : [false]) for (const { pin, x, y } of order) {
    if (out.get(pin.friend.id)?.mode && out.get(pin.friend.id)?.mode !== 'none') continue;
    const modes = passModes.filter((m) =>
      m === 'emoji' ? !!pin.bubble.emoji : !!pin.bubble.thought && !emojiOnly);
    // A bubble with an emoji and no thought still gets its emoji.
    if (!pin.bubble.thought && pin.bubble.emoji && !modes.includes('emoji') && passModes === passes[passes.length - 1]) modes.push('emoji');
    let chosen: ChipPlacement = { mode: 'none', side: 'above', dx: 0 };
    // A pin outside the map gets no chip (a shifted chip would float away from it).
    const onScreen = x >= 0 && x <= view.w && y >= 0 && y <= view.h + AVATAR_PX;
    search: for (const mode of onScreen || !opts.shift ? modes : []) {
      const { w, h } = chipSize(pin, mode, maxW, lines);
      let dx = 0;
      if (opts.shift) {
        if (x - w / 2 < 4) dx = 4 - (x - w / 2);
        else if (x + w / 2 > view.w - 4) dx = view.w - 4 - (x + w / 2);
      }
      // Clear of quest pins, a blocked chip may also slide sideways, as long as it still
      // overlaps the avatar's column so it reads as that friend's.
      const reach = Math.max(0, w / 2 - 14);
      const slides = strict ? [0, -reach / 2, reach / 2, -reach, reach] : [0];
      for (const side of sides) for (const slide of slides) {
        const cx = dx + slide;
        const box = side === 'above'
          ? { x0: x + cx - w / 2, y0: y - AVATAR_PX - CHIP_GAP - h, x1: x + cx + w / 2, y1: y - AVATAR_PX - CHIP_GAP }
          : { x0: x + cx - w / 2, y0: y + CHIP_GAP, x1: x + cx + w / 2, y1: y + CHIP_GAP + h };
        const inside = box.x0 >= 4 && box.x1 <= view.w - 4 && box.y0 >= 0 && (side === 'above' || box.y1 <= view.h);
        if (inside && !taken.some((t) => overlaps(t, box)) && !(strict && soft.some((t) => overlaps(t, box)))) { chosen = { mode, side, dx: Math.round(cx) }; taken.push(box); break search; }
      }
    }
    out.set(pin.friend.id, chosen);
  }
  return out;
}

/** A quest pin's tap box around its point (the 40 px circle and the seat badge), in screen px. */
export const questBox = (q: { x: number; y: number }): Box => ({ x0: q.x - 22, y0: q.y - 24, x1: q.x + 22, y1: q.y + 34 });

/** The box a friend avatar covers, its bottom centre at (x, y). */
const avatarBox = (x: number, y: number): Box => ({ x0: x - AVATAR_PX / 2, y0: y - AVATAR_PX, x1: x + AVATAR_PX / 2, y1: y });

/**
 * The [dx, dy] px that moves a friend avatar (bottom centre at x, y) off every quest pin box, so
 * the quest pin under it stays tappable; [0, 0] when it is already clear. Candidates are the four
 * sides of the pin it covers (beside it, above the circle, below the badge); the smallest move
 * that stays on a map viewW x viewH px and clear of every quest pin wins, preferring one that is
 * also clear of the other avatars (others, bottom centres).
 */
export function clearOfQuests(
  x: number, y: number, quests: Box[], view: { w: number; h: number } = { w: Infinity, h: Infinity },
  others: { x: number; y: number }[] = [],
): [number, number] {
  const hits = (b: Box) => quests.some((q) => overlaps(q, b));
  if (!hits(avatarBox(x, y))) return [0, 0];
  const cands: [number, number][] = [];
  for (const q of quests) {
    if (!overlaps(q, avatarBox(x, y))) continue;
    cands.push([q.x1 + AVATAR_PX / 2 + 2, y], [q.x0 - AVATAR_PX / 2 - 2, y], [x, q.y0 - 2], [x, q.y1 + AVATAR_PX + 2]);
  }
  const ok = cands.filter(([cx, cy]) => {
    const b = avatarBox(cx, cy);
    return b.x0 >= 4 && b.x1 <= view.w - 4 && b.y0 >= 0 && cy <= view.h && !hits(b);
  });
  const clearOfOthers = ok.filter(([cx, cy]) => !others.some((o) => overlaps(avatarBox(o.x, o.y), avatarBox(cx, cy))));
  const pool = clearOfOthers.length ? clearOfOthers : ok;
  if (!pool.length) return [0, 0];
  const [bx, by] = pool.reduce((best, c) => (Math.hypot(c[0] - x, c[1] - y) < Math.hypot(best[0] - x, best[1] - y) ? c : best));
  return [Math.round(bx - x), Math.round(by - y)];
}
