// Where trees go in the 3D view. OpenStreetMap tiles have grass, parks and woods but no single
// trees, so trees are placed on a fixed grid (aligned to one origin, so tile overlaps give the
// same points and every viewer sees the same trees) with a hashed jitter, inside green areas and
// along streets, never inside a building. Pure functions; Vitest covers them.
import { haversineMeters, type LatLng } from '@/shared';
import { offsetMeters } from './math';
import type {TreeKind} from './vegetation';

export type TreeSpot = { lat: number; lng: number; height: number; tone: number;kind?:TreeKind };
type Ring = number[][]; // [lng, lat][]
export type Area = { rings: Ring[]; spacing: number };
export type Street = { coords: number[][]; spacing: number; offset: number; width?:number;trees?:boolean };

const M_PER_DEG = 111_320;

/** Stable 0..1 noise for an integer cell. */
export function hash01(x: number, y: number, salt = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function fromOffset(origin: LatLng, east: number, north: number): LatLng {
  return { lat: origin.lat + north / M_PER_DEG, lng: origin.lng + east / (M_PER_DEG * Math.cos((origin.lat * Math.PI) / 180)) };
}

/** Ray-casting point-in-ring on [lng, lat] pairs. */
function inRing(p: LatLng, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > p.lat) !== (yj > p.lat) && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring and outside every hole. */
export function inPolygon(p: LatLng, rings: Ring[]): boolean {
  if (rings.length === 0 || !inRing(p, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) if (inRing(p, rings[i])) return false;
  return true;
}

type Box = { minLng: number; minLat: number; maxLng: number; maxLat: number };
function boxOf(rings: Ring[]): Box {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of rings[0] ?? []) {
    if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  return { minLng, minLat, maxLng, maxLat };
}
const inBox = (p: LatLng, b: Box) => p.lng >= b.minLng && p.lng <= b.maxLng && p.lat >= b.minLat && p.lat <= b.maxLat;

/** Grid cell for the blocker index, in degrees (about 45 m). */
const CELL = 0.0005;
/**
 * "Is this point inside any of these polygons?", fast for thousands of polygons (downtown SF): each
 * polygon is filed under the grid cells its box covers, so a lookup tests only that cell's few.
 */
function indexedTest(items: { rings: Ring[]; box: Box }[]): (p: LatLng) => boolean {
  const grid = new Map<number, number[]>();
  const huge: number[] = [];
  const key = (x: number, y: number) => x * 1_000_003 + y;
  items.forEach((it, i) => {
    if (!Number.isFinite(it.box.minLng)) return;
    const x0 = Math.floor(it.box.minLng / CELL), x1 = Math.floor(it.box.maxLng / CELL);
    const y0 = Math.floor(it.box.minLat / CELL), y1 = Math.floor(it.box.maxLat / CELL);
    // Huge polygons (water, big parks) are few: always tested, never filed per cell.
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) { huge.push(i); return; }
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const k = key(x, y); const list = grid.get(k); if (list) list.push(i); else grid.set(k, [i]);
    }
  });
  const hit = (p: LatLng, i: number) => { const b = items[i]; return inBox(p, b.box) && inPolygon(p, b.rings); };
  return (p) => {
    const ids = grid.get(key(Math.floor(p.lng / CELL), Math.floor(p.lat / CELL)));
    if (ids) for (const i of ids) if (hit(p, i)) return true;
    for (const i of huge) if (hit(p, i)) return true;
    return false;
  };
}

/**
 * Trees for the area within `radiusM` of `center`: inside green `areas`, beside `streets`, and
 * never inside a `blockers` polygon (buildings). The nearest `cap` are returned.
 */
export function placeTrees(opts: {
  origin: LatLng; center: LatLng; radiusM: number; cap: number;
  areas: Area[]; streets: Street[]; blockers: Ring[][];
}): TreeSpot[] {
  const { origin, center, radiusM, cap } = opts;
  const blockers = opts.blockers.map((rings) => ({ rings, box: boxOf(rings) }));
  const blocked = indexedTest(blockers);
  const near = (p: LatLng) => haversineMeters(center, p) <= radiusM;
  const roadCells=new Map<string,{ax:number;ay:number;dx:number;dy:number;len2:number;r:number}[]>(),cell=24,focus=offsetMeters(origin,center);
  for(const st of opts.streets)for(let k=1;k<st.coords.length;k++){
    const a=offsetMeters(origin,{lng:st.coords[k-1][0],lat:st.coords[k-1][1]}),b=offsetMeters(origin,{lng:st.coords[k][0],lat:st.coords[k][1]}),r=(st.width??(st.offset>9?8:5.5))/2+1.7;
    const segment={ax:a.east,ay:a.north,dx:b.east-a.east,dy:b.north-a.north,len2:(b.east-a.east)**2+(b.north-a.north)**2,r};
    const x0=Math.floor(Math.max(focus.east-radiusM,Math.min(a.east,b.east)-r)/cell),x1=Math.floor(Math.min(focus.east+radiusM,Math.max(a.east,b.east)+r)/cell),y0=Math.floor(Math.max(focus.north-radiusM,Math.min(a.north,b.north)-r)/cell),y1=Math.floor(Math.min(focus.north+radiusM,Math.max(a.north,b.north)+r)/cell);
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const key=`${x}:${y}`,list=roadCells.get(key)??[];list.push(segment);roadCells.set(key,list);}
  }
  const roadBlocked=(p:LatLng)=>{const o=offsetMeters(origin,p);for(const s of roadCells.get(`${Math.floor(o.east/cell)}:${Math.floor(o.north/cell)}`)??[]){const t=s.len2?Math.max(0,Math.min(1,((o.east-s.ax)*s.dx+(o.north-s.ay)*s.dy)/s.len2)):0;if((o.east-s.ax-t*s.dx)**2+(o.north-s.ay-t*s.dy)**2<s.r*s.r)return true;}return false;};
  const out = new Map<string, TreeSpot & { d: number }>();
  const keep = (p: LatLng, key: string, salt: number) => {
    if (out.has(key) || !near(p) || blocked(p)) return;
    // Keep trunks and the inner crown clear of building walls, not just the centre point.
    for(const [e,n] of [[1.8,0],[-1.8,0],[0,1.8],[0,-1.8]])if(blocked(fromOffset(p,e,n)))return;
    if(roadBlocked(p))return;
    const tone=hash01(salt,3,key.length),kind=Math.min(3,Math.floor(tone*4)) as TreeKind;
    const height=kind===3?3.8+tone*1.8:key.startsWith('s:')?5.5+tone*2.5:7+tone*4;
    out.set(key,{...p,height,tone,kind,d:haversineMeters(center,p)});
  };

  // Green areas: a grid in meters from the origin, one jittered tree per cell.
  for (const a of opts.areas) {
    const b = boxOf(a.rings);
    if (!Number.isFinite(b.minLng)) continue;
    const sw = offsetMeters(origin, { lat: b.minLat, lng: b.minLng });
    const ne = offsetMeters(origin, { lat: b.maxLat, lng: b.maxLng });
    const s = a.spacing;
    const i0 = Math.floor(Math.max(sw.east,focus.east-radiusM) / s), i1 = Math.ceil(Math.min(ne.east,focus.east+radiusM) / s);
    const j0 = Math.floor(Math.max(sw.north,focus.north-radiusM) / s), j1 = Math.ceil(Math.min(ne.north,focus.north+radiusM) / s);
    if ((i1 - i0) * (j1 - j0) > 40_000) continue; // a huge polygon at low zoom: skip
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const p = fromOffset(origin, (i + 0.15 + hash01(i, j, 1) * 0.7) * s, (j + 0.15 + hash01(i, j, 2) * 0.7) * s);
        const density=.45+hash01(Math.floor(i/3),Math.floor(j/3),23)*.4;
        if (hash01(i,j,24)<density&&inPolygon(p, a.rings)) keep(p, `a${s}:${i}:${j}`, i * 31 + j);
      }
    }
  }

  // Street trees: every `spacing` meters along each line, on both sides at `offset` meters.
  for (const st of opts.streets) {
    if(st.trees===false)continue;
    for (let k = 1; k < st.coords.length; k++) {
      const a = offsetMeters(origin, { lng: st.coords[k - 1][0], lat: st.coords[k - 1][1] });
      const b = offsetMeters(origin, { lng: st.coords[k][0], lat: st.coords[k][1] });
      const dx = b.east - a.east, dy = b.north - a.north;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      const nx = -dy / len, ny = dx / len;
      for (let t = Math.max(14,st.spacing*.5); t < len-14; t += st.spacing) {
        const jitter=(hash01(Math.round(a.east),Math.round(t),11)-.5)*st.spacing*.35;
        const ex = a.east + (dx * (t+jitter)) / len, ny0 = a.north + (dy * (t+jitter)) / len;
        for (const side of [-1, 1]) {
          const e = ex + nx * st.offset * side, n = ny0 + ny * st.offset * side;
          // Snap to a 6 m grid so the same street split across tiles gives the same trees.
          const key = `s:${Math.round(e / 6)}:${Math.round(n / 6)}`;
          keep(fromOffset(origin, e, n), key, Math.round(e) * 7 + Math.round(n));
        }
      }
    }
  }

  return [...out.values()].sort((x, y) => x.d - y.d).slice(0, cap).map((t) => ({ lat: t.lat, lng: t.lng, height: t.height, tone: t.tone,kind:t.kind }));
}

/** A fast "is this point inside a building?" test over many polygons (bounding boxes first). */
export function blockerTest(polys: Ring[][]): (p: LatLng) => boolean {
  const items = polys.filter((r) => r.length && r[0].length > 2).map((rings) => ({ rings, box: boxOf(rings) }));
  return indexedTest(items);
}

/** The nearest point to `p` that is not blocked: rings of 24 directions, every 4 m out to 150 m. */
export function nearestOpen(p: LatLng, blocked: (q: LatLng) => boolean): LatLng {
  if (!blocked(p)) return p;
  const origin = p;
  for (let r = 4; r <= 150; r += 4) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const q = fromOffset(origin, Math.sin(a) * r, Math.cos(a) * r);
      if (!blocked(q)) return q;
    }
  }
  return p;
}

/** How far (meters, up to `maxM`) you can walk from `p` along `heading` before a building or water. */
export function clearRun(p: LatLng, heading: number, blocked: (q: LatLng) => boolean, maxM = 60): number {
  const a = (heading * Math.PI) / 180;
  for (let r = 3; r <= maxM; r += 3) if (blocked(fromOffset(p, Math.sin(a) * r, Math.cos(a) * r))) return r - 3;
  return maxM;
}

/** The heading with the most open ground ahead: `prefer` (e.g. both ways along the street) wins when it has room. */
export function openHeading(p: LatLng, blocked: (q: LatLng) => boolean, prefer: number[] = []): number | null {
  const best = (hs: number[]) => hs.map((h) => ({ h, run: clearRun(p, h, blocked) })).sort((x, y) => y.run - x.run)[0] ?? null;
  const street = best(prefer);
  if (street && street.run >= 24) return street.h;
  const any = best(Array.from({ length: 16 }, (_, k) => k * 22.5));
  return any && (!street || any.run > street.run) ? any.h : street?.h ?? null;
}

/** The closest point to `p` on any of `lines` ([lng, lat] coords), if one is within `maxM` meters. */
export function nearestOnLines(p: LatLng, lines: number[][][], maxM: number): LatLng | null {
  let best: { e: number; n: number; d: number } | null = null;
  for (const coords of lines) {
    for (let k = 1; k < coords.length; k++) {
      const a = offsetMeters(p, { lng: coords[k - 1][0], lat: coords[k - 1][1] });
      const b = offsetMeters(p, { lng: coords[k][0], lat: coords[k][1] });
      const dx = b.east - a.east, dy = b.north - a.north;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, -(a.east * dx + a.north * dy) / len2)) : 0;
      const e = a.east + dx * t, n = a.north + dy * t;
      const d = Math.hypot(e, n);
      if (d <= maxM && (!best || d < best.d)) best = { e, n, d };
    }
  }
  return best ? fromOffset(p, best.e, best.n) : null;
}

/** Face along the nearest mapped street at startup, rather than framing a wall across it. */
export function streetHeading(p:LatLng,lines:number[][][],current:number):number|null{
 let best=Infinity,heading:number|null=null;
 for(const coords of lines)for(let k=1;k<coords.length;k++){
  const segment=[coords[k-1],coords[k]],point=nearestOnLines(p,[segment],80);if(!point)continue;const distance=haversineMeters(p,point);if(distance>=best)continue;
  const a=offsetMeters(p,{lng:coords[k-1][0],lat:coords[k-1][1]}),b=offsetMeters(p,{lng:coords[k][0],lat:coords[k][1]});if(Math.hypot(b.east-a.east,b.north-a.north)<2)continue;
  const forward=(Math.atan2(b.east-a.east,b.north-a.north)*180/Math.PI+360)%360,back=(forward+180)%360,difference=(a:number,b:number)=>Math.abs(((a-b+540)%360)-180);heading=difference(forward,current)<=difference(back,current)?forward:back;best=distance;
 }return heading;
}
