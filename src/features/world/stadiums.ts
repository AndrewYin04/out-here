// Quest "stadiums" (docs/3D_VIEW_PLAN.md, "Quest stadiums"; issue #23): every open plan near you
// is a small arena at its beacon, with one seat per spot. Pure logic only, so Vitest covers it;
// WorldLayer draws the seats and World3D floats the labels.
import { haversineMeters, type LatLng, type Quest } from '@/shared';
import { minutesLeft } from './math';

/** Stadium labels are shown for plans within this distance of the avatar… */
export const STADIUM_RADIUS_M = 2500;
/** …and only for the nearest few, so the street view never turns into a wall of pins. */
export const STADIUM_LABEL_CAP = 8;
/** The arena bowl never has more seats drawn than this (a 40-person event still reads). */
export const MAX_DRAWN_SEATS = 24;

export type Seat = {
  /** Compass angle around the arena, degrees (0 = north). */
  angle: number;
  /** Which tier (0 = inner ring). Rings hold up to 12 seats each. */
  tier: number;
  taken: boolean;
};

/**
 * Seats around an arena: `capacity` spots, the first `taken` of them filled, spread evenly over
 * one or two rings. Very large plans are drawn at MAX_DRAWN_SEATS, keeping the taken share.
 */
export function stadiumSeats(capacity: number, taken: number): Seat[] {
  const cap = Math.max(0, Math.floor(capacity));
  if (cap === 0) return [];
  const drawn = Math.min(cap, MAX_DRAWN_SEATS);
  const takenClamped = Math.min(cap, Math.max(0, Math.floor(taken)));
  // Keep the open seats honest when scaling down: at least one open seat shows while any is open.
  let drawnTaken = Math.round((takenClamped / cap) * drawn);
  if (takenClamped < cap && drawnTaken >= drawn) drawnTaken = drawn - 1;
  if (takenClamped > 0 && drawnTaken === 0) drawnTaken = 1;
  const perRing = 12;
  const rings = Math.ceil(drawn / perRing);
  const seats: Seat[] = [];
  for (let i = 0; i < drawn; i++) {
    const tier = Math.floor(i / perRing);
    const inRing = tier < rings - 1 ? perRing : drawn - tier * perRing;
    const k = i - tier * perRing;
    // Offset alternate rings by half a seat so they read as stepped stands.
    const angle = ((k + (tier % 2 ? 0.5 : 0)) / inRing) * 360;
    seats.push({ angle: Math.round(angle * 100) / 100, tier, taken: i < drawnTaken });
  }
  return seats;
}

export type StadiumLabel = {
  id: string;
  emoji: string;
  title: string;
  seatsLeft: number;
  minutes: number;
  meters: number;
  pick: boolean;
  selected: boolean;
};

/**
 * The plans that get a floating stadium label: open, not full, within STADIUM_RADIUS_M of `from`.
 * Muse picks and the selected plan always make the cut; the rest fill up by distance.
 */
export function stadiumLabels(
  quests: Quest[],
  from: LatLng,
  opts: { picks?: string[] | null; selectedId?: string | null; cap?: number; radiusM?: number; focusId?: string | null } = {},
): StadiumLabel[] {
  const picks = new Set(opts.picks ?? []);
  const cap = opts.cap ?? STADIUM_LABEL_CAP;
  const radius = opts.radiusM ?? STADIUM_RADIUS_M;
  const rows = quests
    .filter((q) => q.id === opts.focusId || (q.status !== 'done' && q.capacity - q.memberIds.length > 0))
    .map((q) => {
      const meters = haversineMeters(from, q.location);
      return {
        id: q.id, emoji: q.emoji, title: q.title,
        seatsLeft: q.capacity - q.memberIds.length,
        minutes: minutesLeft(from, q.location),
        meters,
        pick: picks.has(q.id),
        selected: q.id === opts.selectedId,
      };
    })
    .filter((r) => r.meters <= radius || r.pick || r.selected)
    .sort((a, b) => Number(b.selected) - Number(a.selected) || Number(b.pick) - Number(a.pick) || a.meters - b.meters);
  // Walking or arriving: only that plan's label, so a nearby arena (Smash night) doesn't cover boba.
  if (opts.focusId) return rows.filter((r) => r.id === opts.focusId).slice(0, 1);
  return rows.slice(0, Math.max(cap, rows.filter((r) => r.pick || r.selected).length));
}

/** "2 spots left", "Last spot" — the seat badge text, worded like the quest panel. */
export function seatText(seatsLeft: number): string {
  return seatsLeft <= 1 ? 'Last spot' : `${seatsLeft} spots left`;
}

/** "here", "3 min", "1 hr 5 min" — walk time shown on a stadium label. */
export function walkText(minutes: number, meters: number): string {
  if (meters <= 35) return 'here';
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
