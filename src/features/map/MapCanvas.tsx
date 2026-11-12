'use client';
// The MapLibre map (client-only; loaded with next/dynamic ssr:false). Quest pins and the
// viewer's dot are DOM markers, so they stay visible even when the vector tiles never load.
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// MapLibre finds its worker next to its own module URL, which the bundler rewrites. Point it at
// the worker file the bundler emits as a static asset instead.
setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href);
import { useEffect, useRef, useState } from 'react';
import type { ID, LatLng, Quest } from '@/shared';
import { cluster, overlaps, shortTitle, type Box } from './cluster';
import { isSoon, pinTime, seatBadge, seatsLeftOf } from './format';
import type { FriendFace } from './types';

export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
/** Menlo Park framing: Meta campus, Bayfront Park (north), Belle Haven (east), Willow Rd toward downtown. */
const FRAME_SW: [number, number] = [-122.168, 37.468];
const FRAME_NE: [number, number] = [-122.134, 37.497];
const TILE_TIMEOUT_MS = 8000;
const PIN = 40;
/** Collision box of a pin around its point: circle plus seat badge, and the label when shown. */
const BOX_W = 46;
const BOX_TOP = 30;
const BOX_BOTTOM = 32;
const LABEL_H = 16;
/** Share of the map the phone plan sheet covers while results show (its max-h-[50%]). */
const PHONE_RESULTS_SHEET = 0.5;
/** Width of a 12 px semibold pin label, estimated so hidden labels can be placed too. */
const labelWidth = (text: string) => Math.ceil(text.length * 6.4) + 6;
/** On phones only the first few plans (selected, joined, soonest) carry a label below zoom 15. */
const MOBILE_LABELS = 5;
const LABEL_ALL_ZOOM = 15;
/** Phones open on the viewer and the nearest few plans. */
const MOBILE_NEAREST = 5;
/** Desktop quest panel: 380 px wide plus its 16 px inset. */
const PANEL_INSET = 396;

export type MapCanvasProps = {
  quests: Quest[];
  selectedId: string | null;
  viewerId: string | null;
  origin: LatLng | null;
  /** Server-computed walking minutes per quest; the phone framing uses the nearest plans. */
  walkMinutes: Record<ID, number> | null;
  /** Friends mode: faces of the friends who joined each quest. */
  friendFaces: Record<ID, FriendFace[]> | null;
  /** Quest ids of the Muse plan on screen: those pins get a blue ring and a "Muse pick" tag, others dim. */
  picks: ID[] | null;
  /** Extra points the plan framing includes (the top suggestion's friends, from their Find My pins). */
  fitTo: LatLng[] | null;
  now: Date;
  testIdFor: (questId: string) => string;
  onSelect: (questId: string) => void;
  onMap: (map: MapLibreMap | null) => void;
  /** WebGL is missing or the map could not be created. */
  onUnsupported: () => void;
};

type PinParts = {
  root: HTMLDivElement; button: HTMLButtonElement; circle: HTMLSpanElement; badge: HTMLSpanElement;
  label: HTMLSpanElement; more: HTMLButtonElement; faces: HTMLSpanElement; pick: HTMLSpanElement;
};
type PinRefs = PinParts & { marker: Marker; seats: number; facesKey: string };

export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const isDesktop = () => window.matchMedia('(min-width: 768px)').matches;

function buildPin(q: Quest, testId: string): PinParts {
  const root = document.createElement('div');
  root.style.width = '0';
  root.style.height = '0';
  root.dataset.questId = q.id;

  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('data-testid', testId);
  button.setAttribute('data-map-marker', 'quest');
  button.className = 'oh-quest-pin';
  button.style.cssText = `position:absolute;width:${PIN}px;height:${PIN + 8}px;left:${-PIN / 2}px;top:${-PIN / 2}px;padding:0;border:0;background:transparent;cursor:pointer;`;

  const circle = document.createElement('span');
  circle.style.cssText = `display:flex;align-items:center;justify-content:center;width:${PIN}px;height:${PIN}px;border-radius:9999px;background:#fff;font-size:22px;line-height:1;transition:box-shadow .15s, transform .15s;`;
  circle.textContent = q.emoji;

  const badge = document.createElement('span');
  badge.style.cssText = 'position:absolute;left:50%;top:30px;transform:translateX(-50%);white-space:nowrap;border-radius:9999px;padding:1px 6px;font:700 11px/14px var(--font-sans);border:2px solid #fff;color:#fff;';

  const label = document.createElement('span');
  label.setAttribute('data-role', 'pin-label');
  label.style.cssText = 'position:absolute;left:50%;top:48px;transform:translateX(-50%);white-space:nowrap;font:600 12px/15px var(--font-sans);color:#080809;text-shadow:0 0 2px #fff,0 0 2px #fff,0 0 3px #fff,0 0 4px #fff;pointer-events:none;';

  const faces = document.createElement('span');
  faces.setAttribute('aria-hidden', 'true');
  faces.style.cssText = 'position:absolute;left:-12px;top:-10px;display:none;pointer-events:none;';

  const more = document.createElement('button');
  more.type = 'button';
  more.setAttribute('data-role', 'cluster');
  more.style.cssText = 'position:absolute;left:4px;top:-34px;min-width:24px;height:24px;padding:0 6px;border-radius:9999px;border:0;background:#fff;color:#080809;font:700 12px/24px var(--font-sans);box-shadow:0 1px 3px rgba(0,0,0,.35);cursor:pointer;display:none;';

  // "✨ Muse pick" tag, attached only while this quest is in the plan on screen.
  const pick = document.createElement('span');
  pick.setAttribute('data-testid', 'muse-pick');
  pick.setAttribute('aria-hidden', 'true');
  pick.textContent = '✨ Muse pick';
  pick.style.cssText = 'position:absolute;left:50%;top:-22px;transform:translateX(-50%);white-space:nowrap;border-radius:9999px;padding:1px 7px;background:#0866FF;color:#fff;font:700 11px/16px var(--font-sans);box-shadow:0 1px 3px rgba(0,0,0,.3);pointer-events:none;';

  button.append(circle, badge, label, faces);
  root.append(button, more);
  return { root, button, circle, badge, label, more, faces, pick };
}

function paintFaces(p: PinRefs, faces: FriendFace[]) {
  const key = faces.map((f) => f.id).join(',');
  if (key === p.facesKey) return;
  p.facesKey = key;
  p.faces.replaceChildren();
  p.faces.style.display = faces.length ? 'flex' : 'none';
  faces.slice(0, 2).forEach((f, i) => {
    const img = document.createElement('img');
    img.src = f.avatarUrl;
    img.alt = '';
    img.style.cssText = `width:20px;height:20px;border-radius:9999px;border:2px solid #fff;object-fit:cover;background:#E2E5E9;box-sizing:content-box;${i > 0 ? 'margin-left:-8px;' : ''}`;
    p.faces.append(img);
  });
}

/** picked: null when no Muse plan is on screen; otherwise whether this quest is one of its picks. */
function paintPin(p: PinRefs, q: Quest, selected: boolean, now: Date, faces: FriendFace[], picked: boolean | null) {
  const seats = seatsLeftOf(q);
  const seatText = seatBadge(seats);
  const time = pinTime(q, now);
  p.badge.textContent = seatText;
  p.badge.style.background = seats > 0 ? '#0866FF' : '#65686C';
  p.label.textContent = `${shortTitle(q.title)} · ${time}`;
  const who = faces.length ? `, ${faces.map((f) => f.name.split(' ')[0]).join(' and ')} going` : '';
  p.button.setAttribute('aria-label', `${picked ? 'Muse pick: ' : ''}${q.title}, ${time === 'Now' ? 'happening now' : `starts ${time}`}, ${seatText}${who}`);
  p.button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  const ring = selected || picked ? '0 0 0 3px #0866FF,' : isSoon(q, now) ? '0 0 0 2.5px #24832C,' : '';
  p.circle.style.boxShadow = `${ring}0 1px 3px rgba(0,0,0,.35)`;
  p.circle.style.transform = selected || picked ? 'scale(1.1)' : 'none';
  p.root.style.zIndex = selected ? '4' : picked ? '3' : '1';
  const dimmed = picked === false && !selected;
  // MapLibre owns the marker root's opacity, so the pin button carries the dimming.
  p.button.style.opacity = dimmed ? '0.4' : '1';
  p.button.style.transition = 'opacity .2s';
  p.root.toggleAttribute('data-dimmed', dimmed);
  if (picked && !p.pick.isConnected) p.button.append(p.pick);
  else if (!picked && p.pick.isConnected) p.pick.remove();
  paintFaces(p, faces);
}

function pulse(el: HTMLElement) {
  el.dataset.pulse = String(Date.now());
  el.animate?.(
    [{ transform: 'translateX(-50%) scale(1)' }, { transform: 'translateX(-50%) scale(1.45)' }, { transform: 'translateX(-50%) scale(1)' }],
    { duration: 500, iterations: 3, easing: 'ease-in-out' },
  );
}

export default function MapCanvas({ quests, selectedId, viewerId, origin, walkMinutes, friendFaces, picks, fitTo, now, testIdFor, onSelect, onMap, onUnsupported }: MapCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const pins = useRef(new Map<string, PinRefs>());
  const groups = useRef(new Map<string, string[]>());
  const me = useRef<Marker | null>(null);
  const order = useRef<string[]>([]);
  const framed = useRef(false);
  const frame = useRef(0);
  const select = useRef(onSelect);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const [tiles, setTiles] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => { select.current = onSelect; });

  // Show the pins that fit; a pin that would overlap a higher-priority one joins its "+N" group.
  const layout = useRef(() => {});
  layout.current = () => {
    const map = mapRef.current;
    if (!map) return;
    const input = order.current.flatMap((id) => {
      const ref = pins.current.get(id);
      if (!ref) return [];
      const p = map.project(ref.marker.getLngLat());
      const box: Box = { x: p.x - BOX_W / 2, y: p.y - BOX_TOP, w: BOX_W, h: BOX_TOP + BOX_BOTTOM };
      return [{ id, box, p }];
    });
    const g = cluster(input);
    groups.current = g;
    // Labels go to the shown pins in priority order, wherever they clear every pin and label.
    const maxLabels = isDesktop() || map.getZoom() >= LABEL_ALL_ZOOM ? Infinity : MOBILE_LABELS;
    const shownBoxes = input.filter((x) => g.has(x.id));
    const taken: Box[] = [];
    for (const { id, p } of shownBoxes) {
      const ref = pins.current.get(id)!;
      const lw = labelWidth(ref.label.textContent ?? '');
      const lb: Box = { x: p.x - lw / 2, y: p.y + BOX_BOTTOM - 4, w: lw, h: LABEL_H };
      // While a plan shows, dimmed pins drop their labels so the "✨ Muse pick" pills have room.
      const fits = !ref.root.hasAttribute('data-dimmed')
        && taken.length < maxLabels
        && !shownBoxes.some((o) => o.id !== id && overlaps(o.box, lb))
        && !taken.some((t) => overlaps(t, lb));
      const show = fits || id === selectedRef.current;
      if (show) taken.push(lb);
      ref.label.style.display = show ? 'block' : 'none';
    }
    for (const [id, ref] of pins.current) {
      const members = g.get(id);
      ref.root.style.display = members ? 'block' : 'none';
      ref.root.toggleAttribute('data-clustered', !members);
      if (members && members.length > 0) {
        ref.more.style.display = 'block';
        ref.more.textContent = `+${members.length}`;
        ref.more.setAttribute('aria-label', `${members.length} more ${members.length === 1 ? 'plan' : 'plans'} here. Zoom in`);
      } else {
        ref.more.style.display = 'none';
      }
    }
  };
  const schedule = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => layout.current());
  };

  // Tap "+N": zoom in on that group until its pins split apart.
  const zoomInto = useRef((id: string) => {
    const map = mapRef.current;
    if (!map) return;
    const b = new LngLatBounds();
    for (const x of [id, ...(groups.current.get(id) ?? [])]) {
      const r = pins.current.get(x);
      if (r) b.extend(r.marker.getLngLat());
    }
    const cam = map.cameraForBounds(b, { padding: 90, maxZoom: 18 });
    const zoom = Math.min(18, Math.max(cam?.zoom ?? 0, map.getZoom() + 1.5));
    map.easeTo({ center: b.getCenter(), zoom, duration: 450 });
  });

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
    if (isDesktop()) map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    framed.current = false; // a new map (dev Strict Mode remounts) needs its own first framing
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
    const pickSet = picks ? new Set(picks) : null;
    for (const q of quests) {
      seen.add(q.id);
      const lngLat: [number, number] = [q.location.lng, q.location.lat];
      let ref = pins.current.get(q.id);
      if (!ref) {
        const parts = buildPin(q, testIdFor(q.id));
        parts.button.addEventListener('click', (e) => { e.stopPropagation(); select.current(q.id); });
        parts.more.addEventListener('click', (e) => { e.stopPropagation(); zoomInto.current(q.id); });
        const marker = new Marker({ element: parts.root, anchor: 'center' }).setLngLat(lngLat).addTo(map);
        ref = { ...parts, marker, seats: seatsLeftOf(q), facesKey: '' };
        pins.current.set(q.id, ref);
      } else {
        ref.marker.setLngLat(lngLat);
        const seats = seatsLeftOf(q);
        if (seats !== ref.seats) { ref.seats = seats; pulse(ref.badge); }
      }
      paintPin(ref, q, q.id === selectedId, now, friendFaces?.[q.id] ?? [], pickSet ? pickSet.has(q.id) : null);
    }
    for (const [id, ref] of pins.current) {
      if (!seen.has(id)) { ref.marker.remove(); pins.current.delete(id); }
    }
    const rank = (q: Quest) => (q.id === selectedId ? 0 : pickSet?.has(q.id) ? 1 : viewerId && q.memberIds.includes(viewerId) ? 2 : 3);
    order.current = [...quests].sort((a, b) => rank(a) - rank(b) || a.startsAt.localeCompare(b.startsAt)).map((q) => q.id);
    schedule();
  }, [quests, selectedId, viewerId, testIdFor, now, friendFaces, picks]);

  // A new Muse plan: frame the viewer, the picked plans and the top suggestion's friends,
  // clear of the plan sheet (left panel on desktop, bottom sheet on phones).
  const picksKey = picks ? picks.join(',') : '';
  const hasQuests = quests.length > 0;
  const fitKey = (fitTo ?? []).map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(';');
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !picksKey) return;
    const ids = new Set(picksKey.split(','));
    const b = new LngLatBounds();
    let n = 0;
    for (const q of quests) if (ids.has(q.id)) { b.extend([q.location.lng, q.location.lat]); n++; }
    if (n === 0) return;
    if (origin) b.extend([origin.lng, origin.lat]);
    for (const p of fitTo ?? []) b.extend([p.lng, p.lat]);
    const h = map.getContainer().clientHeight;
    const padding = isDesktop()
      ? { top: 90, bottom: 70, left: 460, right: 90 }
      // With results the phone sheet drops to a peek of 50% of the map (PlanSheet); fit the
      // picks, their pills and labels in the space above it, 24 px clear of the sheet edge.
      : { top: 72, bottom: Math.max(0, Math.min(Math.round(h * PHONE_RESULTS_SHEET) + 24 + BOX_BOTTOM + LABEL_H, h - 72 - 90)), left: 48, right: 48 };
    map.fitBounds(b, { padding, maxZoom: isDesktop() ? 16 : 15.5, duration: 600 });
    schedule();
    // quests/origin/fitTo are read at the moment a plan arrives; picksKey and fitKey trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picksKey, fitKey, hasQuests]);

  // First framing, once the plans and the viewer's walking times are in. Desktop shows every
  // plan; phones show the viewer and the nearest few, so the first view is not a crowd of pins.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || framed.current || quests.length === 0 || !origin || !walkMinutes) return;
    framed.current = true;
    const desktop = isDesktop();
    const pick = desktop
      ? quests
      : [...quests].sort((a, b) => (walkMinutes[a.id] ?? 1e9) - (walkMinutes[b.id] ?? 1e9)).slice(0, MOBILE_NEAREST);
    const b = new LngLatBounds();
    for (const q of pick) b.extend([q.location.lng, q.location.lat]);
    b.extend([origin.lng, origin.lat]);
    map.fitBounds(b, {
      padding: desktop ? { top: 90, bottom: 70, left: 120, right: 120 } : { top: 100, bottom: 120, left: 80, right: 80 },
      maxZoom: desktop ? 15.5 : 15,
      duration: 0,
    });
    schedule();
  }, [quests, origin, walkMinutes]);

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
    return () => { marker.remove(); if (me.current === marker) me.current = null; };
  }, [origin]);

  // Keep the selected pin in view beside the panel (desktop) or above the sheet (phones);
  // clear the padding when the panel closes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const ref = selectedId ? pins.current.get(selectedId) : null;
    if (!ref) {
      const p = map.getPadding();
      if (p.left || p.bottom) map.easeTo({ padding: { left: 0, right: 0, top: 0, bottom: 0 }, duration: 300 });
      return;
    }
    const padding = isDesktop()
      ? { left: PANEL_INSET, right: 0, top: 0, bottom: 0 }
      : { left: 0, right: 0, top: 0, bottom: Math.round(map.getContainer().clientHeight * 0.5) };
    map.easeTo({ center: ref.marker.getLngLat(), padding, duration: 400 });
  }, [selectedId]);

  return (
    <div className="absolute inset-0 bg-[#EEF0F2]" data-tiles={tiles}>
      {/* Inline position: maplibre-gl.css sets .maplibregl-map { position: relative } outside any layer. */}
      <div ref={container} style={{ position: 'absolute', inset: 0 }} data-testid="map-canvas" />
      {tiles === 'failed' && (
        <p role="status" className="pointer-events-none absolute bottom-24 left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap rounded-pill bg-fb-surface px-3 py-1.5 text-[13px] text-fb-text-2 shadow-card">
          Map details didn&apos;t load. Plans are still live.
        </p>
      )}
    </div>
  );
}
