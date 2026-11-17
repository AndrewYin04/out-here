// The 3D view's look: the same OpenFreeMap tiles, restyled while 3D is open. Real OSM buildings
// at their mapped heights with lit, height-tinted walls; green grass, parks and woods; blue
// water; white streets; a sky with haze at the horizon. Every change is recorded so leaving 3D
// puts the 2D Positron style back exactly.
import type { Map as MapLibreMap, LightSpecification, SkySpecification, AddLayerObject } from 'maplibre-gl';

export const BUILDINGS_ID = 'oh-3d-buildings';
const GRASS_ID = 'oh-3d-grass';
const PITCH_ID = 'oh-3d-pitch';

type PaintProp = Parameters<MapLibreMap['setPaintProperty']>[1];
type PaintValue = Parameters<MapLibreMap['setPaintProperty']>[2];
/** Paint overrides on Positron's own layers: [layer id, property, value]. Missing layers are skipped. */
const PAINT: [string, PaintProp, PaintValue][] = [
  ['background', 'background-color', '#D8EDC4'],
  ['park', 'fill-color', '#A9DA8E'],
  ['landcover_wood', 'fill-color', '#8FCB7A'],
  ['landuse_residential', 'fill-color', '#DDEFCB'],
  ['water', 'fill-color', '#84C8EE'],
  ['waterway', 'line-color', '#84C8EE'],
  ['highway_path', 'line-color', '#F8F3E6'],
  ['highway_minor', 'line-color', '#FFFFFF'],
  ['highway_major_casing', 'line-color', '#CFD7E0'],
  ['highway_major_inner', 'line-color', '#FFFFFF'],
  ['highway_motorway_casing', 'line-color', '#E3D29E'],
  ['highway_motorway_inner', 'line-color', '#FFF3CF'],
  // The flat footprints sit under the 3D walls; drop them where the walls are drawn.
  ['building', 'fill-opacity', ['interpolate', ['linear'], ['zoom'], 15.5, 1, 16.5, 0]],
];

const LIGHT: LightSpecification = { anchor: 'map', color: '#FFFFFF', intensity: 0.28, position: [1.4, 215, 38] };
const SKY: SkySpecification = {
  'sky-color': '#7DBBF2',
  'horizon-color': '#DCEBFA',
  'fog-color': '#EEF4F9',
  'sky-horizon-blend': 0.55,
  'horizon-fog-blend': 0.5,
  'fog-ground-blend': 0.55,
  'atmosphere-blend': 0,
};

/** The vector source that holds OpenMapTiles layers (OpenFreeMap names it "openmaptiles"). */
export function tileSourceId(map: MapLibreMap): string | null {
  const style = map.getStyle();
  const layer = style.layers.find((l) => 'source-layer' in l && l['source-layer'] === 'building');
  const id = layer && 'source' in layer ? String(layer.source) : 'openmaptiles';
  return map.getSource(id) ? id : null;
}

/** Restyles the map for the 3D view. Returns a function that undoes every change. */
export function applyCityTheme(map: MapLibreMap): () => void {
  const undo: (() => void)[] = [];
  const source = tileSourceId(map);
  const style = map.getStyle();
  const firstSymbol = style.layers.find((l) => l.type === 'symbol')?.id;
  const firstRoad = style.layers.find((l) => 'source-layer' in l && l['source-layer'] === 'transportation')?.id;

  for (const [id, prop, value] of PAINT) {
    if (!map.getLayer(id)) continue;
    const before = map.getPaintProperty(id, prop);
    map.setPaintProperty(id, prop, value);
    undo.push(() => { if (map.getLayer(id)) map.setPaintProperty(id, prop, before); });
  }

  const add = (layer: AddLayerObject, beforeId?: string) => {
    if (map.getLayer(layer.id)) return;
    map.addLayer(layer, beforeId && map.getLayer(beforeId) ? beforeId : undefined);
    undo.push(() => { if (map.getLayer(layer.id)) map.removeLayer(layer.id); });
  };

  if (source) {
    // Grass and sports fields: in the tiles, not drawn by Positron.
    add({
      id: GRASS_ID, type: 'fill', source, 'source-layer': 'landcover',
      filter: ['match', ['get', 'class'], ['grass', 'wetland', 'farmland'], true, false],
      paint: { 'fill-color': '#B5DD98', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 14, 1] },
    }, firstRoad);
    add({
      id: PITCH_ID, type: 'fill', source, 'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['pitch', 'playground', 'stadium', 'track', 'park', 'cemetery'], true, false],
      paint: { 'fill-color': '#9FD487', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 14, 1] },
    }, firstRoad);
    // Real buildings at their mapped heights, walls tinted by height and lit from the south-west.
    add({
      id: BUILDINGS_ID, type: 'fill-extrusion', source, 'source-layer': 'building', minzoom: 14.5,
      paint: {
        'fill-extrusion-color': [
          'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8],
          0, '#E6E1F2', 10, '#DCD9EE', 25, '#D2DCF1', 60, '#C8D7F0',
        ],
        // Full mapped height from a distance; up close behind the avatar they drop to 25% (as in
        // Pokémon GO), so the low camera sees the street instead of a wall of roof.
        'fill-extrusion-height': [
          'interpolate', ['linear'], ['zoom'],
          18, ['coalesce', ['get', 'render_height'], 8],
          19.6, ['*', 0.25, ['coalesce', ['get', 'render_height'], 8]],
        ],
        'fill-extrusion-base': [
          'interpolate', ['linear'], ['zoom'],
          18, ['coalesce', ['get', 'render_min_height'], 0],
          19.6, ['*', 0.25, ['coalesce', ['get', 'render_min_height'], 0]],
        ],
        'fill-extrusion-vertical-gradient': true,
        'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 16.5, 0.95, 18.5, 0.95, 19.6, 0.82],
      },
    }, firstSymbol);
  }

  const light = map.getLight();
  map.setLight(LIGHT);
  undo.push(() => map.setLight(light ?? {}));
  const sky = map.getSky();
  map.setSky(SKY);
  undo.push(() => map.setSky(sky ?? {}));

  return () => { for (const u of undo.reverse()) { try { u(); } catch { /* map already gone */ } } };
}
