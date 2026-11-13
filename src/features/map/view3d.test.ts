import { describe, expect, it } from 'vitest';
import { DEMO_CENTER } from '@/shared';
import { CHARACTER_MIN_ZOOM } from '@/features/world/math';
import {
  ENTER_3D_ZOOM, MARKER_FULL_ZOOM, MARKER_HIDE_ZOOM, characterOpacityForZoom, initialView,
  markerOpacityForZoom, shouldEnter3d,
} from './view3d';

describe('initialView', () => {
  it('lands on 3D on a fresh visit', () => expect(initialView(null, null, false)).toBe('3d'));
  it('keeps the overhead map for automated browsers', () => expect(initialView(null, null, true)).toBe('map'));
  it('?view= wins over everything', () => {
    expect(initialView('map', '3d', false)).toBe('map');
    expect(initialView('3d', 'map', true)).toBe('3d');
  });
  it('remembers this tab’s last view', () => expect(initialView(null, 'map', false)).toBe('map'));
  it('ignores junk values', () => expect(initialView('vr', 'nope', false)).toBe('3d'));
});

describe('shouldEnter3d', () => {
  const near = { lat: DEMO_CENTER.lat + 0.002, lng: DEMO_CENTER.lng };
  const far = { lat: DEMO_CENTER.lat + 0.02, lng: DEMO_CENTER.lng };
  it('enters when zoomed in close to you', () => expect(shouldEnter3d(ENTER_3D_ZOOM, near, DEMO_CENTER)).toBe(true));
  it('stays on the map below the threshold', () => expect(shouldEnter3d(ENTER_3D_ZOOM - 0.1, near, DEMO_CENTER)).toBe(false));
  it('stays on the map when zoomed in somewhere else', () => expect(shouldEnter3d(18, far, DEMO_CENTER)).toBe(false));
});

describe('marker / character crossfade', () => {
  it('hides map markers at street level', () => {
    expect(markerOpacityForZoom(MARKER_HIDE_ZOOM)).toBe(0);
    expect(markerOpacityForZoom(CHARACTER_MIN_ZOOM + 1)).toBe(0);
    expect(characterOpacityForZoom(MARKER_HIDE_ZOOM)).toBe(1);
  });
  it('shows map markers once zoomed out toward the flat handoff', () => {
    expect(markerOpacityForZoom(MARKER_FULL_ZOOM)).toBe(1);
    expect(markerOpacityForZoom(MARKER_FULL_ZOOM - 0.5)).toBe(1);
    expect(characterOpacityForZoom(MARKER_FULL_ZOOM)).toBe(0);
  });
  it('crossfades smoothly between the two', () => {
    const mid = (MARKER_FULL_ZOOM + MARKER_HIDE_ZOOM) / 2;
    const m = markerOpacityForZoom(mid);
    expect(m).toBeGreaterThan(0.2);
    expect(m).toBeLessThan(0.8);
    expect(characterOpacityForZoom(mid)).toBeCloseTo(1 - m, 5);
  });
});
