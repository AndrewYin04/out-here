// The Memories overview map as data: one pin per place, grouping every crew memory that happened
// at the same venue (so pins never stack), and the memories with no known location kept aside for
// the list. Pure, so Vitest covers it.
import type { LngLat } from './mapContract';

export type MemoryPlace = {
  coordinates: LngLat | null;
  venueName: string | null;
  emoji: string | null;
  startsAt: string | null;
};

/** What a pin needs from a crew row. */
export type PinnableMemory = { id: string; name: string; lastHangoutAt: string; place: MemoryPlace | null };

export type MemoryPin<T extends PinnableMemory = PinnableMemory> = {
  /** Stable: the first (most recent) memory's id. */
  id: string;
  coordinates: LngLat;
  venueName: string | null;
  emoji: string | null;
  /** Most recent first. */
  memories: T[];
};

/** About 25 m at Menlo Park's latitude: closer than this counts as the same place. */
const SAME_PLACE_DEG = 0.00025;

const recent = (a: PinnableMemory, b: PinnableMemory) =>
  Date.parse(b.place?.startsAt ?? b.lastHangoutAt) - Date.parse(a.place?.startsAt ?? a.lastHangoutAt);

export function groupMemoryPins<T extends PinnableMemory>(rows: T[]): { pins: MemoryPin<T>[]; unplaced: T[] } {
  const pins: MemoryPin<T>[] = [];
  const unplaced: T[] = [];
  for (const row of [...rows].sort(recent)) {
    const c = row.place?.coordinates ?? null;
    if (!c) { unplaced.push(row); continue; }
    const near = pins.find((p) => Math.abs(p.coordinates[0] - c[0]) < SAME_PLACE_DEG && Math.abs(p.coordinates[1] - c[1]) < SAME_PLACE_DEG);
    if (near) near.memories.push(row);
    else pins.push({ id: row.id, coordinates: c, venueName: row.place?.venueName ?? null, emoji: row.place?.emoji ?? null, memories: [row] });
  }
  return { pins, unplaced };
}

/** South-west and north-east corners around all pins, for the first camera framing. */
export function pinBounds(pins: { coordinates: LngLat }[]): [LngLat, LngLat] | null {
  if (pins.length === 0) return null;
  const xs = pins.map((p) => p.coordinates[0]), ys = pins.map((p) => p.coordinates[1]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
}
