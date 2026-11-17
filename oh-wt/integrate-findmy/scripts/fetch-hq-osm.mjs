// Builds public/geo/meta-hq.json: the Meta HQ campus from OpenStreetMap, for the detailed HQ
// models in the 3D view (src/features/world/hq.ts).
//
//   node scripts/fetch-hq-osm.mjs                         # query Overpass (public API, be gentle)
//   node scripts/fetch-hq-osm.mjs --from b.json e.json    # rebuild from saved Overpass responses
//
// What it keeps: Meta buildings (name has MPK / Meta / Facebook) inside the campus box, the
// building:part ways inside them (OSM 3D: parts replace the outline), MPK 20's rooftop park,
// other parks, sports fields and plazas, and individually mapped trees.
// Data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright).
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const BOX = { s: 37.4775, w: -122.1625, n: 37.4885, e: -122.144 };
const bbox = `${BOX.s},${BOX.w},${BOX.n},${BOX.e}`;
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const Q_BUILDINGS = `[out:json][timeout:60];(way["building"](${bbox});way["building:part"](${bbox}););out tags geom;`;
const Q_EXTRAS = `[out:json][timeout:60];(way["leisure"](${bbox});way["highway"="pedestrian"](${bbox});node["natural"="tree"](${bbox}););out tags geom;`;

async function overpass(q) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch(OVERPASS, { method: 'POST', body: new URLSearchParams({ data: q }), headers: { 'User-Agent': 'out-here-hackathon-demo' } });
    const text = await r.text();
    if (r.ok && text.startsWith('{')) return JSON.parse(text);
    console.warn(`Overpass busy (attempt ${attempt}), retrying in 20 s`);
    await new Promise((res) => setTimeout(res, 20_000));
  }
  throw new Error('Overpass did not answer; try again later or use --from');
}

/** Ways may come as `geometry` (out geom) or as node refs plus separate nodes (out body; >; out skel). */
function ringsOf(way, nodes) {
  const pts = way.geometry
    ? way.geometry.filter(Boolean).map((p) => [round(p.lon), round(p.lat)])
    : (way.nodes ?? []).map((id) => nodes.get(id)).filter(Boolean).map((p) => [round(p.lon), round(p.lat)]);
  return pts.length >= 4 ? [pts] : [];
}
const round = (x) => Math.round(x * 1e7) / 1e7;
const num = (v) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : null; };
const centroid = (ring) => ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const args = process.argv.slice(2);
let raw, extras;
if (args[0] === '--from') {
  raw = JSON.parse(await readFile(args[1], 'utf8'));
  extras = JSON.parse(await readFile(args[2], 'utf8'));
} else {
  raw = await overpass(Q_BUILDINGS);
  await new Promise((res) => setTimeout(res, 5000));
  extras = await overpass(Q_EXTRAS);
}

const nodes = new Map(raw.elements.filter((e) => e.type === 'node').map((n) => [n.id, n]));
const ways = raw.elements.filter((e) => e.type === 'way' && e.tags);
const isMeta = (t) => /\b(MPK|Meta|Facebook)\b/i.test(t.name ?? '') && t.building;

const outlines = ways.filter((w) => isMeta(w.tags)).map((w) => ({ w, rings: ringsOf(w, nodes) })).filter((x) => x.rings.length);
const insideMeta = (rings) => outlines.some((o) => inRing(centroid(rings[0]), o.rings[0]));
// Only parts with height data replace their outline (a part with no levels or height would
// flatten a whole building).
const hasHeight = (t) => num(t['building:levels']) != null || num(t.height) != null;
const parts = ways
  .filter((w) => w.tags['building:part'] && hasHeight(w.tags))
  .map((w) => ({ w, rings: ringsOf(w, nodes) }))
  .filter((x) => x.rings.length && insideMeta(x.rings));

const inBox = ([lng, lat]) => lat >= BOX.s && lat <= BOX.n && lng >= BOX.w && lng <= BOX.e;
const buildings = [...outlines.map((x) => ({ ...x, part: false })), ...parts.map((x) => ({ ...x, part: true }))]
  .filter((x) => inBox(centroid(x.rings[0])))
  .map(({ w, rings, part }) => ({
    id: w.id,
    name: w.tags.name ?? null,
    ref: w.tags.ref ?? null,
    part,
    hasParts: !part && parts.some((p) => inRing(centroid(p.rings[0]), rings[0])),
    levels: num(w.tags['building:levels']),
    minLevel: num(w.tags['building:min_level']) ?? num(w.tags.min_level),
    height: num(w.tags.height),
    minHeight: num(w.tags.min_height),
    rings,
  }));

const ex = extras.elements;
const wayRings = (pred) => ex.filter((e) => e.type === 'way' && pred(e.tags ?? {})).map((e) => ({ name: e.tags.name ?? null, rings: ringsOf(e, new Map()) })).filter((x) => x.rings.length);
const roofParks = wayRings((t) => t.leisure === 'park' && /rooftop|roof/i.test(t.name ?? ''));
const parks = wayRings((t) => t.leisure === 'park' && !/rooftop|roof/i.test(t.name ?? ''));
const pitches = wayRings((t) => t.leisure === 'pitch');
const plazas = wayRings((t) => t.highway === 'pedestrian');
const trees = ex.filter((e) => e.type === 'node' && e.tags?.natural === 'tree').map((n) => [round(n.lon), round(n.lat)]);

const out = {
  attribution: '© OpenStreetMap contributors (ODbL 1.0)',
  source: 'https://www.openstreetmap.org/copyright',
  generated: new Date().toISOString(),
  box: BOX,
  buildings, roofParks, parks, pitches, plazas, trees,
};
await mkdir('public/geo', { recursive: true });
await writeFile('public/geo/meta-hq.json', JSON.stringify(out));
console.log(`buildings ${buildings.length} (${buildings.filter((b) => b.part).length} parts), roof parks ${roofParks.length}, parks ${parks.length}, pitches ${pitches.length}, plazas ${plazas.length}, trees ${trees.length}`);
