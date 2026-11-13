// Map / 3D: which view Out Here opens on, and when a zoom on the 2D map steps into 3D.
// Pure functions (no DOM), so Vitest covers them. The world area's EXIT_3D_ZOOM is the way out.
import { haversineMeters, type LatLng } from '@/shared';

export type MapView = 'map' | '3d';

/** Pinching the 2D map in past this zoom near you steps into the 3D street view. */
export const ENTER_3D_ZOOM = 17.4;
/** Only this close to you: 3D opens behind your avatar, so zooming in elsewhere stays on the map. */
export const ENTER_3D_NEAR_M = 900;

export function shouldEnter3d(zoom: number, center: LatLng, me: LatLng): boolean {
  return zoom >= ENTER_3D_ZOOM && haversineMeters(center, me) <= ENTER_3D_NEAR_M;
}

/**
 * The view Out Here opens on: ?view= first (demo links, tests), then this tab's last choice, then
 * 3D (the "Pokémon Go" landing). Automated browsers default to the 2D map so the map specs keep
 * their overhead camera; they open 3D with ?view=3d.
 */
export function initialView(param: string | null, saved: string | null, automated: boolean): MapView {
  if (param === '3d' || param === 'map') return param;
  if (saved === '3d' || saved === 'map') return saved;
  return automated ? 'map' : '3d';
}
