// Map / 3D: which view Out Here opens on, and when a zoom on the 2D map steps into 3D.
// Pure functions (no DOM), so Vitest covers them. The world area's EXIT_3D_ZOOM is the way out.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { haversineMeters, type LatLng } from '@/shared';
import { CHARACTER_MIN_ZOOM, EXIT_3D_ZOOM } from '@/features/world/math';

export type MapView = 'map' | '3d';

/** 3D → flat-map you-pin sync (MapLibre custom event; not in MapEventType). */
export type AvatarMapEvent = {
  lat: number;
  lng: number;
  markerOpacity: number;
  /** Friend ids that currently have a 3D avatar (hide their HTML pins while bodies are up). */
  avatarFriendIds: string[];
};

type MapBus = {
  on(type: string, listener: (ev: AvatarMapEvent) => void): void;
  on(type: string, listener: () => void): void;
  off(type: string, listener: (ev: AvatarMapEvent) => void): void;
  off(type: string, listener: () => void): void;
  fire(type: string, properties?: object): void;
};

const bus = (map: MapLibreMap) => map as unknown as MapBus;

export function fireAvatar(map: MapLibreMap, detail: AvatarMapEvent) {
  bus(map).fire('outhere:avatar', detail);
}

export function fireAvatarEnd(map: MapLibreMap) {
  bus(map).fire('outhere:avatar-end');
}

export function onAvatar(map: MapLibreMap, listener: (ev: AvatarMapEvent) => void) {
  bus(map).on('outhere:avatar', listener);
  return () => bus(map).off('outhere:avatar', listener);
}

export function onAvatarEnd(map: MapLibreMap, listener: () => void) {
  bus(map).on('outhere:avatar-end', listener);
  return () => bus(map).off('outhere:avatar-end', listener);
}

/** Pinching the 2D map in past this zoom near you steps into the 3D street view. */
export const ENTER_3D_ZOOM = 17.4;
/** Only this close to you: 3D opens behind your avatar, so zooming in elsewhere stays on the map. */
export const ENTER_3D_NEAR_M = 900;

/**
 * Map "you" / friend HTML markers are fully visible at this zoom (still above the 2D handoff),
 * so the crossfade finishes before the view flips to the flat map.
 */
export const MARKER_FULL_ZOOM = EXIT_3D_ZOOM + 0.25;
/** At and above this zoom, 3D bodies are fully on and map you-markers are gone. */
export const MARKER_HIDE_ZOOM = CHARACTER_MIN_ZOOM;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * Opacity of the flat-map you-dot / You photo while the 3D view is open.
 * 0 at street level (the 3D body is the only you), 1 once zoomed out toward the city map.
 */
export function markerOpacityForZoom(zoom: number): number {
  if (zoom >= MARKER_HIDE_ZOOM) return 0;
  if (zoom <= MARKER_FULL_ZOOM) return 1;
  return 1 - smoothstep((zoom - MARKER_FULL_ZOOM) / (MARKER_HIDE_ZOOM - MARKER_FULL_ZOOM));
}

/** Opacity of 3D characters: the inverse of the map-marker fade. */
export function characterOpacityForZoom(zoom: number): number {
  return 1 - markerOpacityForZoom(zoom);
}

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
