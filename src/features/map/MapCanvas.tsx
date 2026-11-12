'use client';
// The MapLibre map (client-only; loaded with next/dynamic ssr:false). Quest pins and the
// viewer's dot are DOM markers, so they stay visible even when the vector tiles never load.
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// MapLibre finds its worker next to its own module URL, which the bundler rewrites. Point it at
// the worker file the bundler emits as a static asset instead.
setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href);
import { useEffect, useRef, useState } from 'react';
import type { LatLng, Quest } from '@/shared';
import { declutter, type Box } from './declutter';
import { seatBadge, seatsLeftOf } from './format';

export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
/** Menlo Park framing: Meta campus, Bayfront Park (north), Belle Haven (east), Willow Rd toward downtown. */
const FRAME_SW: [number, number] = [-122.168, 37.468];
const FRAME_NE: [number, number] = [-122.134, 37.497];
const TILE_TIMEOUT_MS = 8000;
const PIN = 40;
const SLOT = 52; // collision square per pin: circle plus seat badge plus a small gap
const ME_SLOT = 24;

export type MapCanvasProps = {
  quests: Quest[];
  selectedId: string | null;
  viewerId: string | null;
  origin: LatLng | null;
  testIdFor: (questId: string) => string;
  onSelect: (questId: string) => void;
  onMap: (map: MapLibreMap | null) => void;
  /** WebGL is missing or the map could not be created. */
  onUnsupported: () => void;
};

type PinRefs = { marker: Marker; root: HTMLDivElement; button: HTMLButtonElement; badge: HTMLSpanElement; line: HTMLSpanElement; dot: HTMLSpanElement; seats: number };

export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function buildPin(q: Quest, testId: string): Omit<PinRefs, 'marker' | 'seats'> {
  const root = document.createElement('div');
  root.style.width = '0';
  root.style.height = '0';
  root.dataset.questId = q.id;

  const line = document.createElement('span');
  line.setAttribute('aria-hidden', 'true');
  line.style.cssText = 'position:absolute;left:0;top:0;height:2px;background:#65686C;transform-origin:0 50%;display:none;pointer-events:none;';
  const dot = document.createElement('span');
  dot.setAttribute('aria-hidden', 'true');
  dot.style.cssText = 'position:absolute;left:-4px;top:-4px;width:8px;height:8px;border-radius:9999px;background:#65686C;border:2px solid #fff;box-sizing:content-box;margin:-2px 0 0 -2px;display:none;pointer-events:none;';

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.testid = testId;
  button.setAttribute('data-testid', testId);
  button.setAttribute('data-map-marker', 'quest');
  button.className = 'oh-quest-pin';
  button.style.cssText = `position:absolute;width:${PIN}px;height:${SLOT - 4}px;left:${-PIN / 2}px;top:${-PIN / 2}px;padding:0;border:0;background:transparent;cursor:pointer;`;

  const circle = document.createElement('span');
  circle.style.cssText = `display:flex;align-items:center;justify-content:center;width:${PIN}px;height:${PIN}px;border-radius:9999px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);font-size:22px;line-height:1;transition:box-shadow .15s, transform .15s;`;
  circle.textContent = q.emoji;
  circle.dataset.role = 'circle';

  const badge = document.createElement('span');
  badge.style.cssText = 'position:absolute;left:50%;top:30px;transform:translateX(-50%);white-space:nowrap;border-radius:9999px;padding:1px 6px;font:700 11px/14px var(--font-sans);border:2px solid #fff;';
  button.append(circle, badge);
  root.append(line, dot, button);
  return { root, button, badge, line, dot };
}

function paintPin(p: Omit<PinRefs, 'marker'>, q: Quest, selected: boolean) {
  const seats = seatsLeftOf(q);
  const label = seatBadge(seats);
  p.badge.textContent = label;
  p.badge.style.background = seats > 0 ? '#0866FF' : '#65686C';
  p.badge.style.color = '#fff';
  p.button.setAttribute('aria-label', `${q.title}, ${label}`);
  p.button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  const circle = p.button.firstElementChild as HTMLElement;
  circle.style.boxShadow = selected ? '0 0 0 3px #0866FF, 0 2px 6px rgba(0,0,0,.35)' : '0 1px 3px rgba(0,0,0,.35)';
  circle.style.transform = selected ? 'scale(1.1)' : 'none';
  p.root.style.zIndex = selected ? '3' : '1';
}

function pulse(el: HTMLElement) {
  el.dataset.pulse = String(Date.now());
  el.animate?.(
    [{ transform: 'translateX(-50%) scale(1)' }, { transform: 'translateX(-50%) scale(1.45)' }, { transform: 'translateX(-50%) scale(1)' }],
    { duration: 500, iterations: 3, easing: 'ease-in-out' },
  );
}

export default function MapCanvas({ quests, selectedId, viewerId, origin, testIdFor, onSelect, onMap, onUnsupported }: MapCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const pins = useRef(new Map<string, PinRefs>());
  const me = useRef<Marker | null>(null);
  const order = useRef<string[]>([]);
  const framed = useRef(false);
  const originRef = useRef(origin);
  useEffect(() => { originRef.current = origin; }, [origin]);
  const frame = useRef(0);
  const select = useRef(onSelect);
  const [tiles, setTiles] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => { select.current = onSelect; });

  // Re-place pins so none overlaps another (or the viewer's dot) at the current zoom.
  const layout = useRef(() => {});
  layout.current = () => {
    const map = mapRef.current;
    if (!map) return;
    const obstacles: Box[] = [];
    if (me.current) {
      const p = map.project(me.current.getLngLat());
      obstacles.push({ x: p.x - ME_SLOT / 2, y: p.y - ME_SLOT / 2, w: ME_SLOT, h: ME_SLOT });
    }
    const input = order.current.flatMap((id) => {
      const ref = pins.current.get(id);
      if (!ref) return [];
      const p = map.project(ref.marker.getLngLat());
      return [{ id, x: p.x, y: p.y }];
    });
    const placed = declutter(input, SLOT, obstacles);
    for (const [id, { dx, dy }] of placed) {
      const ref = pins.current.get(id)!;
      ref.button.style.left = `${dx - PIN / 2}px`;
      ref.button.style.top = `${dy - PIN / 2}px`;
      const moved = dx !== 0 || dy !== 0;
      ref.line.style.display = moved ? 'block' : 'none';
      ref.dot.style.display = moved ? 'block' : 'none';
      if (moved) {
        ref.line.style.width = `${Math.hypot(dx, dy)}px`;
        ref.line.style.transform = `translateY(-1px) rotate(${Math.atan2(dy, dx)}rad)`;
      }
    }
  };
  const schedule = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => layout.current());
  };

  // Create the map once.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    if (!hasWebGL()) { onUnsupported(); return; }
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: el,
        style: MAP_STYLE_URL,
        bounds: new LngLatBounds(FRAME_SW, FRAME_NE),
        fitBoundsOptions: { padding: 8 },
        minZoom: 3,
        maxZoom: 18,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
    } catch {
      onUnsupported();
      return;
    }
    map.touchZoomRotate.disableRotation();
    // Zoom buttons on desktop; phones pinch.
    if (window.matchMedia('(min-width: 768px)').matches) map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    let loaded = false;
    const timer = window.setTimeout(() => { if (!loaded) setTiles('failed'); }, TILE_TIMEOUT_MS);
    map.on('load', () => { loaded = true; window.clearTimeout(timer); setTiles('ready'); });
    // Tile or style errors are shown as the plain-background state, not thrown to the console.
    map.on('error', () => {});
    map.on('move', schedule);
    map.on('resize', schedule);
    onMap(map);
    const current = pins.current;
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame.current);
      current.clear();
      me.current = null;
      onMap(null);
      map.remove();
      mapRef.current = null;
    };
    // onMap / onUnsupported are stable setters from the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync quest pins with the data: add, update (pulse on seat change), remove.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    for (const q of quests) {
      seen.add(q.id);
      const lngLat: [number, number] = [q.location.lng, q.location.lat];
      let ref = pins.current.get(q.id);
      if (!ref) {
        const parts = buildPin(q, testIdFor(q.id));
        parts.button.addEventListener('click', (e) => { e.stopPropagation(); select.current(q.id); });
        const marker = new Marker({ element: parts.root, anchor: 'center' }).setLngLat(lngLat).addTo(map);
        ref = { ...parts, marker, seats: seatsLeftOf(q) };
        pins.current.set(q.id, ref);
      } else {
        ref.marker.setLngLat(lngLat);
        const seats = seatsLeftOf(q);
        if (seats !== ref.seats) { ref.seats = seats; pulse(ref.badge); }
      }
      paintPin(ref, q, q.id === selectedId);
    }
    for (const [id, ref] of pins.current) {
      if (!seen.has(id)) { ref.marker.remove(); pins.current.delete(id); }
    }
    // First data: frame the plans (and the viewer) so the pins use the whole screen.
    if (!framed.current && quests.length > 0) {
      framed.current = true;
      const b = new LngLatBounds();
      for (const q of quests) b.extend([q.location.lng, q.location.lat]);
      const o = originRef.current;
      if (o) b.extend([o.lng, o.lat]);
      const desktop = window.matchMedia('(min-width: 768px)').matches;
      map.fitBounds(b, { padding: desktop ? { top: 90, bottom: 60, left: 120, right: 120 } : { top: 80, bottom: 60, left: 36, right: 36 }, maxZoom: 15.5, duration: 0 });
    }
    const rank = (q: Quest) => (q.id === selectedId ? 0 : viewerId && q.memberIds.includes(viewerId) ? 1 : 2);
    order.current = [...quests].sort((a, b) => rank(a) - rank(b) || a.startsAt.localeCompare(b.startsAt)).map((q) => q.id);
    schedule();
  }, [quests, selectedId, viewerId, testIdFor]);

  // The viewer's own dot (where walking times are measured from).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !origin) return;
    const el = document.createElement('div');
    el.setAttribute('data-map-marker', 'me');
    el.setAttribute('aria-label', 'You');
    el.setAttribute('role', 'img');
    el.style.cssText = 'width:18px;height:18px;border-radius:9999px;background:#0866FF;border:3px solid #fff;box-shadow:0 0 0 6px rgba(8,102,255,.2),0 1px 3px rgba(0,0,0,.3);';
    const marker = new Marker({ element: el, anchor: 'center' }).setLngLat([origin.lng, origin.lat]).addTo(map);
    me.current = marker;
    schedule();
    return () => { marker.remove(); if (me.current === marker) me.current = null; };
  }, [origin]);

  // Pan so a newly selected pin is not hidden under the sheet or panel.
  useEffect(() => {
    const map = mapRef.current;
    const ref = selectedId ? pins.current.get(selectedId) : null;
    if (!map || !ref) return;
    const desktop = window.matchMedia('(min-width: 768px)').matches;
    const padding = desktop ? { left: 400, right: 40, top: 80, bottom: 40 } : { left: 24, right: 24, top: 80, bottom: Math.round(window.innerHeight * 0.55) };
    const p = map.project(ref.marker.getLngLat());
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    const inside = p.x > padding.left && p.x < w - padding.right && p.y > padding.top && p.y < h - padding.bottom;
    if (!inside) map.easeTo({ center: ref.marker.getLngLat(), padding, duration: 400 });
  }, [selectedId]);

  return (
    <div className="absolute inset-0 bg-[#EEF0F2]" data-tiles={tiles}>
      {/* Inline position: maplibre-gl.css sets .maplibregl-map { position: relative } outside any layer. */}
      <div ref={container} style={{ position: 'absolute', inset: 0 }} data-testid="map-canvas" />
      {tiles === 'failed' && (
        <p role="status" className="pointer-events-none absolute left-1/2 top-16 z-[2] -translate-x-1/2 rounded-pill bg-fb-surface px-3 py-1.5 text-[13px] text-fb-text-2 shadow-card">
          Map details didn&apos;t load. Plans are still live.
        </p>
      )}
    </div>
  );
}
