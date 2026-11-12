// The integration contract between the Memories journey (UI state) and a map renderer.
//
// The Memories UI owns: the selected collection, the selected stop, the timeline, the detail
// sheet and Muse regroup. The map owns: camera position and transitions, 3D rendering, markers,
// route animation, and (later) the viewer's avatar in third-person mode.
//
// To connect the real map: build a component that takes `MemoryMapProps`, then point
// `JourneyMap` in ./mapSlot.ts at it. Nothing else in the Memories UI has to change.
import type { ComponentType } from 'react';

/** Geographic coordinate in MapLibre order: [longitude, latitude]. */
export type LngLat = [number, number];

export type MemoryCameraMode = 'overview' | 'first-person' | 'third-person';

export type MemoryMapPoint = {
  /** Stop id (one per place in the journey; several photos can share one stop). */
  id: string;
  /** Venue or hangout name for the marker label. */
  title: string;
  emoji: string | null;
  /** [lng, lat]; null when the location is unknown. Such stops stay off the map, never guessed. */
  coordinates: LngLat | null;
  /** Cover photo for the marker. */
  photoUrl: string | null;
  /** Photos at this stop (a grouped marker shows the count). */
  photoCount: number;
  /** ISO start time, for the marker label and route order. */
  startsAt: string | null;
};

export type MemoryMapProps = {
  /** Stops of ONE journey, in time order. Never the user's whole history. */
  points: MemoryMapPoint[];
  /** The stop the UI has selected; the map should fly its camera there. */
  selectedMemoryId: string | null;
  /** Called when the user taps a marker. The UI updates the timeline and the detail sheet. */
  onSelectMemory: (id: string) => void;
  /** Overview (angled 3D) by default; immersive modes reuse the team's camera and avatar. */
  cameraMode?: MemoryCameraMode;
  /**
   * Bumps every time the user re-selects a stop (even the same one), so the map can replay the
   * fly-to. Compare with the previous value; the number itself means nothing.
   */
  focusRequest?: number;
  /** True when the user prefers reduced motion: jump the camera instead of animating. */
  reducedMotion?: boolean;
  className?: string;
};

export type MemoryMapComponent = ComponentType<MemoryMapProps>;
