# Memories journey: map integration

The Memories UI (`/memories` library, `/memories/[crewId]` journey) works today with a 2D
placeholder map. This note is for whoever connects the 3D map, camera and avatar.

## The one swap point

`src/features/memories/mapSlot.ts`:

```ts
export const JourneyMap: MemoryMapComponent = MemoryMapPreview;
```

Point `JourneyMap` at a component that implements `MemoryMapProps`. Load it with
`next/dynamic(() => import(...), { ssr: false })` so WebGL only starts on the journey page,
never on the library. Keep `MemoryMapPreview` as the fallback when WebGL is unavailable.
No other Memories file needs to change.

## Contract (`mapContract.ts`)

```ts
type LngLat = [number, number];                 // [longitude, latitude], MapLibre order
type MemoryCameraMode = 'overview' | 'first-person' | 'third-person';

type MemoryMapPoint = {
  id: string;              // stop id (= quest id); several photos share one stop
  title: string;           // venue name, for the marker label
  emoji: string | null;
  coordinates: LngLat | null;  // null = unknown: leave it off the map, never guess
  photoUrl: string | null; // cover photo for the marker
  photoCount: number;      // grouped marker count
  startsAt: string | null; // ISO; route order
};

type MemoryMapProps = {
  points: MemoryMapPoint[];          // ONE journey, time order
  selectedMemoryId: string | null;   // fly the camera here
  onSelectMemory: (id: string) => void; // call on marker tap
  cameraMode?: MemoryCameraMode;     // 'overview' today
  focusRequest?: number;             // bumps on every (re)select: replay the fly-to
  reducedMotion?: boolean;           // jump instead of animating
  className?: string;                // fills the stage (absolute inset-0)
};
```

## Who owns what

| Memories UI | Map renderer |
|---|---|
| selected collection and stop, timeline, detail sheet, photo index, Muse regroup | camera position and transitions, 3D render, markers, route animation, avatar placement |

The map never changes UI state except through `onSelectMemory`. The UI never moves the camera
except through `selectedMemoryId` / `focusRequest`.

## Data notes

- Stops come from `buildJourney()` (`journey.ts`): a crew's photos grouped by `questId`, ordered
  by the quest's start time. Exact coordinates only reach crew members (from
  `GET /api/quests/:id`); otherwise `coordinates` is `null`.
- Today every seeded crew is a one-venue hangout, so journeys have one stop. Multi-stop journeys
  render automatically when photos from several quests share a crew.
- The route between stops is the map's job; draw it only between stops with coordinates.

## Companion (Jolly)

No approved Jolly asset is on `main`. `RegroupPanel` takes an optional `companion` node rendered
next to Muse's reply (`data-slot="muse-companion"`). Nothing is drawn there until an approved
asset is passed in.
