// Detailed Meta HQ for the 3D view, from OpenStreetMap (public/geo/meta-hq.json, built by
// scripts/fetch-hq-osm.mjs). Real footprints and floor counts, facades with a window grid per
// floor and bay, roofs with parapets, MPK 20's rooftop park, and the campus's individually mapped
// trees at their real positions (on the roof where they stand on it).
// Data © OpenStreetMap contributors (ODbL); the map attribution already credits OSM.
import * as THREE from 'three';
import type { LatLng } from '@/shared';
import { offsetMeters } from './math';
import { hash01, inPolygon } from './trees';

type Ring = number[][];
export type HqBuilding = {
  id: number; name: string | null; ref: string | null; part: boolean; hasParts: boolean;
  levels: number | null; minLevel: number | null; height: number | null; minHeight: number | null;
  rings: Ring[];
};
export type HqData = {
  attribution: string;
  box: { s: number; w: number; n: number; e: number };
  buildings: HqBuilding[];
  roofParks: { name: string | null; rings: Ring[] }[];
  plazas: { name: string | null; rings: Ring[] }[];
  trees: number[][];
};
export type HqLabel = { id: string; name: string; pos: LatLng; altitude: number };

/** Office floors on this campus are tall; parapets sit above the top floor. */
export const FLOOR_M = 4.5;
const PARAPET_M = 1.1;
/** OSM has no floor count for some buildings (MPK 21): assume the campus norm. */
const DEFAULT_LEVELS_MPK = 3;
const DEFAULT_LEVELS = 2;
const BAY_M = 3.6;

let dataPromise: Promise<HqData | null> | null = null;
export function loadHq(): Promise<HqData | null> {
  dataPromise ??= fetch('/geo/meta-hq.json')
    .then((r) => (r.ok ? (r.json() as Promise<HqData>) : null))
    .catch(() => null);
  return dataPromise;
}

/** Base and top in meters for a building, from height tags, else floors. */
export function heightsOf(b: HqBuilding): { base: number; top: number } {
  const levels = b.levels ?? (/MPK/i.test(b.name ?? '') ? DEFAULT_LEVELS_MPK : DEFAULT_LEVELS);
  const base = b.minHeight ?? (b.minLevel != null ? b.minLevel * FLOOR_M : 0);
  const top = b.height ?? levels * FLOOR_M;
  return { base, top: Math.max(top, base + 2) };
}

/** Short label: "MPK 20" from "Meta MPK 20", "Building 19" from "Facebook Building 19". */
export function shortName(name: string | null): string | null {
  if (!name) return null;
  const m = name.match(/\b(MPK\s*\d+|Building\s*\d+)\b/i);
  return m ? m[1].replace(/\s+/, ' ') : name;
}

// ---- Facade textures (one tile = one bay × one floor) ----

type FacadeStyle = 'classic' | 'gehry';
function facadeTexture(style: FacadeStyle): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 160;
  const g = c.getContext('2d')!;
  if (style === 'classic') {
    // The 1 Hacker Way buildings: warm stucco with long window bands.
    g.fillStyle = '#E8D7BF'; g.fillRect(0, 0, 128, 160);
    const glass = g.createLinearGradient(0, 40, 0, 118);
    glass.addColorStop(0, '#9FC0DA'); glass.addColorStop(1, '#4E6E8E');
    g.fillStyle = glass; g.fillRect(6, 40, 116, 78);
    g.fillStyle = '#D9C6AB'; g.fillRect(0, 118, 128, 8); // sill
    g.fillStyle = '#C9B597'; g.fillRect(62, 40, 4, 78); // mullion
  } else {
    // MPK 20 / 21: white panels and tall glass.
    g.fillStyle = '#F1F1EE'; g.fillRect(0, 0, 128, 160);
    const glass = g.createLinearGradient(0, 14, 0, 150);
    glass.addColorStop(0, '#B7D3EA'); glass.addColorStop(1, '#58799C');
    g.fillStyle = glass; g.fillRect(8, 14, 112, 136);
    g.fillStyle = '#E2E4E6'; for (const x of [42, 84]) g.fillRect(x, 14, 3, 136);
    g.fillStyle = '#D9DBDD'; g.fillRect(0, 150, 128, 10);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// ---- Geometry helpers (local frame: x = east, y = up, z = south, meters) ----

function toLocal(origin: LatLng, ring: Ring): THREE.Vector2[] {
  return ring.map(([lng, lat]) => { const o = offsetMeters(origin, { lat, lng }); return new THREE.Vector2(o.east, o.north); });
}

/** Wall quads for every edge of every ring, with UVs in bays (u) and floors (v). */
function wallGeometry(rings: THREE.Vector2[][], base: number, top: number, floorM: number): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const ring of rings) {
    let u0 = 0;
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i];
      const len = a.distanceTo(b);
      if (len < 0.05) continue;
      const u1 = u0 + len / BAY_M;
      const n = pos.length / 3;
      pos.push(a.x, base, -a.y, b.x, base, -b.y, b.x, top, -b.y, a.x, top, -a.y);
      uv.push(u0, base / floorM, u1, base / floorM, u1, top / floorM, u0, top / floorM);
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
      u0 = u1;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A flat polygon (outer ring + holes) at height y. */
function flatGeometry(rings: THREE.Vector2[][], y: number): THREE.BufferGeometry | null {
  if (!rings[0] || rings[0].length < 4) return null;
  const shape = new THREE.Shape(rings[0].slice(0, -1));
  for (const hole of rings.slice(1)) shape.holes.push(new THREE.Path(hole.slice(0, -1)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2); // shape (x = east, y = north) → (x, 0, -north)
  g.translate(0, y, 0);
  return g;
}

function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (geos.length === 0) return null;
  // Minimal merge for same-attribute geometries (position/normal/uv + index).
  const out = new THREE.BufferGeometry();
  const names = ['position', 'normal', 'uv'].filter((n) => geos.every((g) => g.getAttribute(n)));
  const arrays: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));
  const index: number[] = [];
  let offset = 0;
  for (const g of geos) {
    const count = g.getAttribute('position').count;
    for (const n of names) { const src = g.getAttribute(n).array; for (let i = 0; i < src.length; i++) arrays[n].push(src[i]); }
    const gi = g.getIndex();
    if (gi) for (let i = 0; i < gi.count; i++) index.push(gi.getX(i) + offset);
    else for (let i = 0; i < count; i++) index.push(i + offset);
    offset += count;
    g.dispose();
  }
  for (const n of names) out.setAttribute(n, new THREE.Float32BufferAttribute(arrays[n], n === 'uv' ? 2 : 3));
  out.setIndex(index);
  return out;
}

export type HqModel = {
  group: THREE.Group;
  /** Up close behind the avatar, lower the buildings (1 = mapped height), as the map's boxes do. */
  setFlatten: (f: number) => void;
  /** OSM way ids of the buildings drawn here; the map's own boxes for them are hidden. */
  wayIds: number[];
  labels: HqLabel[];
  /** Outer rings of the modeled buildings, for "no procedural trees here". */
  footprints: Ring[][];
  dispose: () => void;
};

/** Builds the campus in the layer's local frame around `origin`. Client only (canvas textures). */
export function buildHq(data: HqData, origin: LatLng): HqModel {
  const group = new THREE.Group();
  /** Walls, roofs, parapets: scaled in height by setFlatten. */
  const tall = new THREE.Group();
  /** The rooftop park and its trees: moved down with the roof, never squashed. */
  const onRoof = new THREE.Group();
  group.add(tall, onRoof);
  let roofTop = 3 * FLOOR_M;
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T) => { disposables.push(x); return x; };

  const styled: Record<FacadeStyle, { walls: THREE.BufferGeometry[]; mat: THREE.MeshStandardMaterial }> = {
    classic: { walls: [], mat: keep(new THREE.MeshStandardMaterial({ map: keep(facadeTexture('classic')), roughness: 0.75, side: THREE.DoubleSide })) },
    gehry: { walls: [], mat: keep(new THREE.MeshStandardMaterial({ map: keep(facadeTexture('gehry')), roughness: 0.45, metalness: 0.05, side: THREE.DoubleSide })) },
  };
  const roofs: THREE.BufferGeometry[] = [];
  const parapets: THREE.BufferGeometry[] = [];
  const labels: HqLabel[] = [];
  const tops: { rings: Ring[]; top: number }[] = [];

  const drawn = data.buildings.filter((b) => b.part || !b.hasParts);
  for (const b of drawn) {
    const { base, top } = heightsOf(b);
    const local = b.rings.map((r) => toLocal(origin, r));
    const style: FacadeStyle = /MPK\s*2\d/i.test(b.name ?? '') ? 'gehry' : 'classic';
    styled[style].walls.push(wallGeometry(local, base, top, FLOOR_M));
    parapets.push(wallGeometry(local, top, top + PARAPET_M, PARAPET_M));
    const roof = flatGeometry(local, top + 0.02);
    if (roof) roofs.push(roof);
    tops.push({ rings: b.rings, top });
    const name = shortName(b.name);
    if (name && !b.part) {
      const ring = b.rings[0];
      const c = ring.reduce((a, p) => ({ lng: a.lng + p[0] / ring.length, lat: a.lat + p[1] / ring.length }), { lng: 0, lat: 0 });
      labels.push({ id: `hq:${b.id}`, name, pos: c, altitude: top + PARAPET_M + 2 });
    }
  }

  for (const s of Object.values(styled)) {
    const g = merge(s.walls);
    if (g) tall.add(new THREE.Mesh(keep(g), s.mat));
  }
  const roofG = merge(roofs);
  if (roofG) tall.add(new THREE.Mesh(keep(roofG), keep(new THREE.MeshStandardMaterial({ color: '#C9CCD1', roughness: 0.9, side: THREE.DoubleSide }))));
  const parG = merge(parapets);
  if (parG) tall.add(new THREE.Mesh(keep(parG), keep(new THREE.MeshStandardMaterial({ color: '#ECEDEE', roughness: 0.8, side: THREE.DoubleSide }))));

  // Rooftop park(s): a planted surface on the roof they sit on.
  const roofTopAt = (p: LatLng) => tops.find((t) => inPolygon(p, t.rings))?.top ?? null;
  const parkTops: { rings: Ring[]; y: number }[] = [];
  for (const park of data.roofParks) {
    const ring = park.rings[0];
    const c = ring.reduce((a, p) => ({ lng: a.lng + p[0] / ring.length, lat: a.lat + p[1] / ring.length }), { lng: 0, lat: 0 });
    roofTop = roofTopAt(c) ?? 3 * FLOOR_M;
    const y = roofTop + 0.35;
    parkTops.push({ rings: park.rings, y });
    const g = flatGeometry(park.rings.map((r) => toLocal(origin, r)), y);
    if (g) onRoof.add(new THREE.Mesh(keep(g), keep(new THREE.MeshStandardMaterial({ color: '#7FBF62', roughness: 1, side: THREE.DoubleSide }))));
  }
  for (const plaza of data.plazas) {
    const g = plaza.rings[0].length > 3 ? flatGeometry(plaza.rings.map((r) => toLocal(origin, r)), 0.06) : null;
    if (g) group.add(new THREE.Mesh(keep(g), keep(new THREE.MeshStandardMaterial({ color: '#EFE8DC', roughness: 1, side: THREE.DoubleSide }))));
  }

  // The campus's mapped trees, on the rooftop park where they stand on it.
  if (data.trees.length) {
    const trunkGeo = keep(new THREE.CylinderGeometry(0.18, 0.26, 1, 6));
    const canopyGeo = keep(new THREE.IcosahedronGeometry(1, 0));
    const trunkMat = keep(new THREE.MeshStandardMaterial({ color: '#86664B', roughness: 0.9 }));
    const canopyMat = keep(new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.85, flatShading: true }));
    const greens = ['#5DAE4B', '#6FBF55', '#4E9E45', '#82C35E'].map((c) => new THREE.Color(c));
    const ground: { o: { east: number; north: number }; y: number; i: number }[] = [];
    const roof: typeof ground = [];
    data.trees.forEach(([lng, lat], i) => {
      const p = { lat, lng };
      const top = parkTops.find((r) => inPolygon(p, r.rings));
      (top ? roof : ground).push({ o: offsetMeters(origin, p), y: top ? top.y : 0, i });
    });
    const plant = (list: typeof ground, small: boolean, into: THREE.Group) => {
      if (list.length === 0) return;
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
      const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, list.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      list.forEach(({ o, y, i }, k) => {
        const h = (small ? 5 : 7) + hash01(i, 11, 3) * 5;
        q.identity();
        m.compose(new THREE.Vector3(o.east, y + h * 0.22, -o.north), q, new THREE.Vector3(h * 0.9, h * 0.44, h * 0.9));
        trunks.setMatrixAt(k, m);
        q.setFromEuler(new THREE.Euler(0, hash01(i, 5, 9) * Math.PI * 2, 0));
        m.compose(new THREE.Vector3(o.east, y + h * 0.62, -o.north), q, new THREE.Vector3(h * 0.34, h * 0.42, h * 0.34));
        canopies.setMatrixAt(k, m);
        canopies.setColorAt(k, greens[Math.floor(hash01(i, 2, 1) * greens.length) % greens.length]);
      });
      trunks.instanceMatrix.needsUpdate = true;
      canopies.instanceMatrix.needsUpdate = true;
      if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
      into.add(trunks, canopies);
      disposables.push(trunks, canopies);
    };
    plant(ground, false, group);
    plant(roof, true, onRoof);
  }

  group.traverse((o) => { o.frustumCulled = false; });
  return {
    group,
    setFlatten: (f: number) => {
      tall.scale.y = f;
      onRoof.position.y = roofTop * (f - 1);
    },
    wayIds: drawn.map((b) => b.id),
    labels,
    footprints: data.buildings.filter((b) => !b.part).map((b) => b.rings),
    dispose: () => { for (const d of disposables) d.dispose(); },
  };
}
