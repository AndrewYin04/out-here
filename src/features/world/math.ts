// Pure math for the 3D view: the zoom-to-pitch curve, angles, walking steps, GPS fix filtering.
// No DOM, no three.js, so Vitest covers all of it.
import { haversineMeters, walkingMinutesExact, type LatLng } from '@/shared';

// ---- Camera: one continuous zoom from the flat city map to the 3D street view ----

/** At or below this zoom the 3D view is flat, the same as the overhead map. */
export const FLAT_ZOOM = 15;
/** At this zoom the camera reaches STREET_PITCH. */
export const STREET_ZOOM = 18.5;
export const STREET_PITCH = 62;
/** Zoomed in closer than street level, the camera drops a little, still over the shoulder. */
export const CLOSE_ZOOM = 21;
// Low, like Pokémon Go: looking across the neighborhood, not down from above the roofs.
export const CLOSE_PITCH = 74;
/** Zoom the 3D view eases to: map-readable Kenney person (~10 m) full body in frame. */
export const ENTER_ZOOM = 19.4;
export const MAX_3D_ZOOM = 22.5;
export const MAX_3D_PITCH = 75;
/** Characters and trees are hidden below this zoom; the 2D pins take over. */
export const CHARACTER_MIN_ZOOM = 18.8;
/**
 * One zoom, two views. Pinching the 3D view out past this zoom (the camera is flat by then) hands
 * over to the 2D map. The map area's ENTER_3D_ZOOM (map/view3d.ts) is the way back in; the gap
 * between them keeps it from flipping back and forth.
 */
export const EXIT_3D_ZOOM = 15.4;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * Camera pitch for a zoom: 0 when zoomed out to the city, STREET_PITCH at street level, and
 * lower still (CLOSE_PITCH) when zoomed right in behind the avatar.
 */
export function pitchForZoom(zoom: number): number {
  const p = zoom <= STREET_ZOOM
    ? STREET_PITCH * smoothstep(clamp01((zoom - FLAT_ZOOM) / (STREET_ZOOM - FLAT_ZOOM)))
    : STREET_PITCH + (CLOSE_PITCH - STREET_PITCH) * smoothstep(clamp01((zoom - STREET_ZOOM) / (CLOSE_ZOOM - STREET_ZOOM)));
  return Math.round(p * 10) / 10;
}

/** Metre-authored models stay at their authored scale. Markers serve distant map views. */
export function characterScale(zoom: number): number { void zoom;return 1; }

// ---- Angles (compass degrees: 0 = north, 90 = east) ----

export function normalizeDeg(d: number): number {
  const r = d % 360;
  return r < 0 ? r + 360 : r;
}

/** Signed shortest turn from a to b, in (-180, 180]. */
export function deltaDeg(a: number, b: number): number {
  const d = normalizeDeg(b - a);
  return d > 180 ? d - 360 : d;
}

/** Moves angle a toward b by a fraction t along the shortest turn. */
export function lerpDeg(a: number, b: number, t: number): number {
  return normalizeDeg(a + deltaDeg(a, b) * t);
}

/** Initial compass bearing from a to b. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return normalizeDeg((Math.atan2(y, x) * 180) / Math.PI);
}

// ---- Walking ----

const M_PER_DEG_LAT = 111_320;

/** The point `meters` from p toward compass `bearing` (flat-earth, fine for a few hundred meters). */
export function moveMeters(p: LatLng, meters: number, bearing: number): LatLng {
  const b = (bearing * Math.PI) / 180;
  const dn = Math.cos(b) * meters;
  const de = Math.sin(b) * meters;
  return {
    lat: p.lat + dn / M_PER_DEG_LAT,
    lng: p.lng + de / (M_PER_DEG_LAT * Math.cos((p.lat * Math.PI) / 180)),
  };
}

/** East/north offset in meters of p from origin (flat-earth). */
export function offsetMeters(origin: LatLng, p: LatLng): { east: number; north: number } {
  return {
    east: (p.lng - origin.lng) * M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180),
    north: (p.lat - origin.lat) * M_PER_DEG_LAT,
  };
}

/** One step of a walk toward a target. Arrives exactly when the step would pass it. */
export function stepToward(p: LatLng, target: LatLng, meters: number): { pos: LatLng; heading: number; arrived: boolean } {
  const d = haversineMeters(p, target);
  const heading = bearingDeg(p, target);
  if (d <= meters || d < 0.5) return { pos: target, heading, arrived: true };
  return { pos: moveMeters(p, meters, heading), heading, arrived: false };
}

/** Real walking speed (the server's 80 m/min) and how much faster the demo walk plays on screen. */
export const DEMO_WALK_SPEEDUP = 20;

/** Whole minutes left on foot, rounded up, as the walking countdown shows them. */
export function minutesLeft(p: LatLng, target: LatLng): number {
  return Math.max(0, Math.ceil(walkingMinutesExact(p, target) - 0.05));
}

/** Within this many meters of a plan's location you have arrived. */
export const ARRIVE_METERS = 35;

// ---- GPS ----

export type GpsFix = { lat: number; lng: number; accuracy: number; heading: number | null; speed: number | null; at: number };

/** Fixes worse than this are thrown away. */
export const MAX_ACCURACY_M = 60;
/** Faster than a sprint between two fixes is a GPS jump, not you. */
const MAX_SPEED_MPS = 9;

/** After this many jumps in a row, the jump is real (a bike, a car, GPS back after a tunnel). */
export const JUMPS_BEFORE_ACCEPT = 3;

/**
 * Keep a new fix, or drop it as too inaccurate or as an impossible jump from the last kept one.
 * `jumpsInARow` counts the fixes just dropped as jumps; once it reaches JUMPS_BEFORE_ACCEPT the
 * new position is accepted, so moving fast never freezes the avatar for good.
 */
export function acceptFix(prev: GpsFix | null, next: GpsFix, jumpsInARow = 0): boolean {
  if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return false;
  if (next.accuracy > MAX_ACCURACY_M) return false;
  if (!prev || jumpsInARow >= JUMPS_BEFORE_ACCEPT) return true;
  const dt = Math.max(0.001, (next.at - prev.at) / 1000);
  const d = haversineMeters(prev, next);
  // Allow the combined accuracy as slack, so a better fix may correct a worse one.
  return (d - Math.max(prev.accuracy, next.accuracy)) / dt <= MAX_SPEED_MPS;
}

/** Heading from a fix: the GPS course while moving, else null (the compass decides). */
export function fixHeading(fix: GpsFix): number | null {
  if (fix.heading == null || Number.isNaN(fix.heading)) return null;
  if (fix.speed != null && fix.speed < 0.6) return null;
  return normalizeDeg(fix.heading);
}

/** Farther than this from the demo area, the 3D view says the plans are elsewhere. */
export const FAR_FROM_DEMO_M = 5000;

/** Geographic buildings and campus floors retain their real heights at every camera zoom. */
export function buildingFlatten(zoom: number): number { void zoom;return 1; }
