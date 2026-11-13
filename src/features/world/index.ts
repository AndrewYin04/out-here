// World area barrel (docs/3D_VIEW_PLAN.md): the 3D street view of the Out Here map.
// The map area loads World3D with next/dynamic (ssr: false), so three.js is only fetched when
// someone opens the 3D view.
export { World3D, type World3DProps } from './World3D';

/** Warm the street view while the person is still on the map: models and campus data load once. */
export async function preloadWorld(): Promise<void> {
  const [{ loadModels }, { loadHq }] = await Promise.all([import('./characters'), import('./hq')]);
  await Promise.all([loadModels(), loadHq()]);
}
