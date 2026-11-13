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
  ['background', 'background-color', '#E5E5D8'],
  ['park', 'fill-color', '#C4D4AD'],
  ['landcover_wood', 'fill-color', '#A9C397'],
  ['landuse_residential', 'fill-color', '#DDDCCD'],
  ['water', 'fill-color', '#91BEC8'],
  ['waterway', 'line-color', '#91BEC8'],
  ['highway_path', 'line-color', '#F8F3E6'],
  ['highway_minor', 'line-color', '#75828A'],
  ['highway_major_casing', 'line-color', '#EEE9DD'],
  ['highway_major_inner', 'line-color', '#75828A'],
  ['highway_motorway_casing', 'line-color', '#D8D1BC'],
  ['highway_motorway_inner', 'line-color', '#879095'],
  // The flat footprints sit under the 3D walls; drop them where the walls are drawn.
  ['building', 'fill-opacity', ['interpolate', ['linear'], ['zoom'], 15.5, 1, 16.5, 0]],
];

const LIGHT: LightSpecification = { anchor: 'map', color: '#FFF1D8', intensity: 0.48, position: [1.4, 215, 38] };
const SKY: SkySpecification = {
  'sky-color': '#BAD2DD',
  'horizon-color': '#E5E8DD',
  'fog-color': '#E5E8DD',
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

  for(const layer of style.layers){
    if(layer.type!=='line'||!('source-layer' in layer)||layer['source-layer']!=='transportation'||!layer.id.startsWith('highway_'))continue;
    const path=/path|track|pedestrian/.test(layer.id), casing=/casing/.test(layer.id), bridge=/bridge/.test(layer.id);
    const width=path?1.7:/motorway/.test(layer.id)?12:/major/.test(layer.id)?8:5.5;
    const beforeColor=map.getPaintProperty(layer.id,'line-color'),beforeWidth=map.getPaintProperty(layer.id,'line-width');
    map.setPaintProperty(layer.id,'line-color',path?'#E8DFCB':casing?'#EEE9DD':bridge?'#8E969A':'#75828A');
    map.setPaintProperty(layer.id,'line-width',['interpolate',['exponential',2],['zoom'],12,(width+(casing?2.2:0))*.0658,22,(width+(casing?2.2:0))*67.4]);
    undo.push(()=>{if(map.getLayer(layer.id)){map.setPaintProperty(layer.id,'line-color',beforeColor);map.setPaintProperty(layer.id,'line-width',beforeWidth);}});
    const hasCasing=style.layers.some(other=>other.id!==layer.id&&(other.id===`${layer.id}_casing`||other.id===layer.id.replace(/_inner$/,'_casing')));
    if(!path&&!casing&&!hasCasing){const id=`oh-curb-${layer.id}`;map.addLayer({...layer,id,paint:{...layer.paint,'line-color':'#EEE9DD','line-opacity':1,'line-width':['interpolate',['exponential',2],['zoom'],12,(width+2.2)*.0658,22,(width+2.2)*67.4]}},layer.id);undo.push(()=>{if(map.getLayer(id))map.removeLayer(id);});}

  }

  const add = (layer: AddLayerObject, beforeId?: string) => {
    if (map.getLayer(layer.id)) return;
    map.addLayer(layer, beforeId && map.getLayer(beforeId) ? beforeId : undefined);
    undo.push(() => { if (map.getLayer(layer.id)) map.removeLayer(layer.id); });
  };

  if (source) {
    add({id:'oh-3d-developed',type:'fill',source,'source-layer':'landuse',filter:['match',['get','class'],['industrial','commercial','retail','residential'],true,false],paint:{'fill-color':['match',['get','class'],'residential','#DEDCCD','#D8D9CE'],'fill-opacity':.7}},firstRoad);
    // Grass and sports fields: in the tiles, not drawn by Positron.
    add({
      id: GRASS_ID, type: 'fill', source, 'source-layer': 'landcover',
      filter: ['match', ['get', 'class'], ['grass', 'wetland', 'farmland'], true, false],
      paint: { 'fill-color': ['match',['get','class'],'wetland','#B7CEC1','farmland','#D0D5AB','#CBD8B4'], 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 14, 1] },
    }, firstRoad);
    add({
      id: PITCH_ID, type: 'fill', source, 'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['pitch', 'playground', 'stadium', 'track', 'park', 'cemetery'], true, false],
      paint: { 'fill-color': '#B6CCA3', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 14, 1] },
    }, firstRoad);
    // Real buildings at their mapped heights, walls tinted by height and lit from the south-west.
    add({
      id: BUILDINGS_ID, type: 'fill-extrusion', source, 'source-layer': 'building', minzoom: 14.5,
      paint: {
        'fill-extrusion-color': [
          'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8],
          0, '#E7DFC9', 10, '#DED7C7', 25, '#D4D5CC', 60, '#C9D4D1',
        ],
        'fill-extrusion-height': ['max', 3.5, ['coalesce', ['get', 'render_height'], 8]],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-vertical-gradient': true,
        'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 14.5, 0, 15.5, 1],
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
