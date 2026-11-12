// The one place the Memories journey picks its map renderer.
//
// Today: MemoryMapPreview (a 2D stand-in, no WebGL). When the team's 3D map and camera are
// ready, export a component that implements MemoryMapProps (see ./mapContract.ts) and point
// JourneyMap at it, ideally loaded with next/dynamic({ ssr: false }) so the Memories library
// never pays for WebGL. Keep MemoryMapPreview as the fallback when WebGL is unavailable.
import type { MemoryMapComponent } from './mapContract';
import { MemoryMapPreview } from './MemoryMapPreview';

export const JourneyMap: MemoryMapComponent = MemoryMapPreview;
