import { expect, it } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { applyCityTheme, BUILDINGS_ID } from './cityTheme';
it('preserves full building height and restores the exact 2D paints and layers on teardown', () => {
    type Layer = {
        id: string;
        type: string;
        source?: string;
        'source-layer'?: string;
        paint?: Record<string, unknown>;
    };
    const original: Layer[] = [{ id: 'background', type: 'background', paint: { 'background-color': '#fafafa' } }, { id: 'building', type: 'fill', source: 'tiles', 'source-layer': 'building', paint: { 'fill-opacity': 1 } }, { id: 'highway_minor', type: 'line', source: 'tiles', 'source-layer': 'transportation', paint: { 'line-color': '#fff', 'line-width': 3 } }, { id: 'labels', type: 'symbol', source: 'tiles', 'source-layer': 'place' }];
    const layers = new Map(original.map(l => [l.id, structuredClone(l)])), light = { intensity: .2 }, sky = {};
    let activeLight: unknown = light, activeSky: unknown = sky;
    const map = { getStyle: () => ({ layers: structuredClone([...layers.values()]) }), getSource: () => ({}), getLayer: (id: string) => layers.get(id), getPaintProperty: (id: string, prop: string) => (layers.get(id)?.paint as Record<string, unknown> | undefined)?.[prop], setPaintProperty: (id: string, prop: string, value: unknown) => { const layer = layers.get(id)!; layer.paint ??= {}; (layer.paint as Record<string, unknown>)[prop] = value; }, addLayer: (layer: typeof original[number]) => layers.set(layer.id, structuredClone(layer)), removeLayer: (id: string) => layers.delete(id), getLight: () => activeLight, setLight: (l: unknown) => { activeLight = l; }, getSky: () => activeSky, setSky: (s: unknown) => { activeSky = s; } };
    const undo = applyCityTheme(map as unknown as MapLibreMap);
    const buildings = layers.get(BUILDINGS_ID)!;
    expect(JSON.stringify(buildings.paint)).not.toContain('0.25');
    expect(JSON.stringify(buildings.paint)).toContain('render_height');
    expect(layers.has('oh-curb-highway_minor')).toBe(true);
    expect(layers.get('highway_minor')!.paint?.['line-color']).not.toBe('#fff');
    undo();
    expect([...layers.keys()].sort()).toEqual(original.map(l => l.id).sort());
    for (const layer of original)
        for (const [prop, value] of Object.entries(layer.paint ?? {}))
            expect(map.getPaintProperty(layer.id, prop)).toEqual(value);
    expect(activeLight).toEqual(light);
    expect(activeSky).toEqual(sky);
});
