'use client';
// Where Out Here starts from: the demo city (default), or "Here": the viewer's real location.
// Here asks for location once, keeps the latest fix in this tab, and asks the server to make sure
// a few ready-made plans are about to start nearby (POST /api/nearby/plans). The position goes to
// the server only for those calls (plans, walking times, Muse's plan) and is never stored.
import { useSyncExternalStore } from 'react';
import type { LatLng } from '@/shared';
import { apiPost } from './client';

export type WhereMode = 'demo' | 'here';
export type WhereStatus = 'off' | 'asking' | 'on' | 'denied' | 'unavailable';
export type Where = { mode: WhereMode; status: WhereStatus; fix: LatLng | null };

const KEY = 'oh.where';
let state: Where = { mode: 'demo', status: 'off', fix: null };
const listeners = new Set<() => void>();
let watchId: number | null = null;
let seededAt: LatLng | null = null;

function emit(next: Partial<Where>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

function meters(a: LatLng, b: LatLng): number {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(s));
}

/** Ready-made plans around a new spot (once per ~1 km moved). */
function seedNearby(at: LatLng) {
  if (seededAt && meters(seededAt, at) < 1000) return;
  seededAt = at;
  void apiPost('/api/nearby/plans', at).catch(() => { seededAt = null; });
}

function stopWatch() {
  if (watchId != null && typeof navigator !== 'undefined') navigator.geolocation?.clearWatch(watchId);
  watchId = null;
}

export function setWhere(mode: WhereMode): void {
  try { window.sessionStorage.setItem(KEY, mode); } catch { /* private mode: this visit only */ }
  if (mode === 'demo') { stopWatch(); emit({ mode, status: 'off', fix: null }); return; }
  if (typeof navigator === 'undefined' || !navigator.geolocation) { emit({ mode: 'demo', status: 'unavailable', fix: null }); return; }
  emit({ mode, status: 'asking' });
  stopWatch();
  watchId = navigator.geolocation.watchPosition(
    (p) => {
      const fix = { lat: p.coords.latitude, lng: p.coords.longitude };
      // Small jitters don't move the map or refetch plans.
      if (state.fix && meters(state.fix, fix) < 40 && state.status === 'on') return;
      emit({ status: 'on', fix });
      seedNearby(fix);
    },
    (err) => {
      stopWatch();
      emit({ mode: 'demo', status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable', fix: null });
    },
    { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
  );
}

/** The real location while Here is on (and fixed), else null: callers fall back to the demo city. */
export function hereLocation(): LatLng | null {
  return state.mode === 'here' && state.status === 'on' ? state.fix : null;
}

let restored = false;
function restore() {
  if (restored || typeof window === 'undefined') return;
  restored = true;
  try { if (window.sessionStorage.getItem(KEY) === 'here') setWhere('here'); } catch { /* ignore */ }
}

export function useWhere(): Where {
  return useSyncExternalStore(
    (cb) => { restore(); listeners.add(cb); return () => listeners.delete(cb); },
    () => state,
    () => state,
  );
}
