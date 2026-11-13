import { describe, expect, it } from 'vitest';
import { DEMO_CENTER } from '@/shared';
import { ENTER_3D_ZOOM, initialView, shouldEnter3d } from './view3d';

describe('initialView', () => {
  it('lands on the 2D map on a fresh visit', () => expect(initialView(null, null, false)).toBe('map'));
  it('does not reopen 3D from a saved choice', () => expect(initialView(null, '3d', false)).toBe('map'));
  it('keeps the overhead map for automated browsers', () => expect(initialView(null, null, true)).toBe('map'));
  it('?view= wins over everything', () => {
    expect(initialView('map', '3d', false)).toBe('map');
    expect(initialView('3d', 'map', true)).toBe('3d');
  });
  it('ignores junk values', () => expect(initialView('vr', 'nope', false)).toBe('map'));
});

describe('shouldEnter3d', () => {
  const near = { lat: DEMO_CENTER.lat + 0.002, lng: DEMO_CENTER.lng };
  const far = { lat: DEMO_CENTER.lat + 0.02, lng: DEMO_CENTER.lng };
  it('enters when zoomed in close to you', () => expect(shouldEnter3d(ENTER_3D_ZOOM, near, DEMO_CENTER)).toBe(true));
  it('stays on the map below the threshold', () => expect(shouldEnter3d(ENTER_3D_ZOOM - 0.1, near, DEMO_CENTER)).toBe(false));
  it('stays on the map when zoomed in somewhere else', () => expect(shouldEnter3d(18, far, DEMO_CENTER)).toBe(false));
});
