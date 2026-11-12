import type { LatLng } from './types';
import { ROUTE_FACTOR, WALK_METERS_PER_MIN } from './demo';

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in meters. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Walking minutes, unrounded: haversine × 1.3 route factor / 80 m per minute. */
export function walkingMinutesExact(a: LatLng, b: LatLng): number {
  return (haversineMeters(a, b) * ROUTE_FACTOR) / WALK_METERS_PER_MIN;
}

/** Walking minutes rounded to the nearest whole minute (the `travelMinutes` shown to users). */
export function walkingMinutes(a: LatLng, b: LatLng): number {
  return Math.round(walkingMinutesExact(a, b));
}

/** Point `meters` away from `from` on compass `bearingDeg` (0 = north, 90 = east). */
export function offsetPoint(from: LatLng, meters: number, bearingDeg: number): LatLng {
  const d = meters / EARTH_RADIUS_M;
  const br = toRad(bearingDeg);
  const lat1 = toRad(from.lat);
  const lng1 = toRad(from.lng);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lng2 =
    lng1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

/** 32-bit string hash (FNV-1a). */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Approximate location for non-members: a point 120–200 m from the exact spot, in a
 * direction fixed by `seed` (use the quest id) so it does not jump between requests.
 */
export function fuzzLocation(exact: LatLng, seed: string): LatLng {
  const h = hash32(seed);
  const bearing = h % 360;
  const meters = 120 + ((h >>> 9) % 81);
  const p = offsetPoint(exact, meters, bearing);
  return { lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) };
}

/**
 * Approximate location for a shared friend location: the centre of the ~`cellM` grid cell that
 * contains `exact`. Every point in a cell maps to the same centre, so it never jumps between
 * requests and never reveals where in the cell the person is.
 */
export function snapToGrid(exact: LatLng, cellM: number): LatLng {
  const latStep = cellM / 111_320;
  const row = Math.floor(exact.lat / latStep);
  const lat = (row + 0.5) * latStep;
  const lngStep = cellM / (111_320 * Math.cos(toRad(lat)));
  const lng = (Math.floor(exact.lng / lngStep) + 0.5) * lngStep;
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}
