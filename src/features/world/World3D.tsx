'use client';
// The 3D street view of the Out Here map (docs/3D_VIEW_PLAN.md): a third-person camera behind the
// viewer's avatar, a Muse pet beside it, 3D buildings, plan beacons, nearby friends as avatars.
// Pinching out tilts the camera up continuously until it is the flat overhead map.
//
// Movement is local to this screen: the demo walk (joystick, arrow keys, "Walk there") or live
// GPS. Neither writes a position to the server; Find My keeps doing location sharing.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrivalSelfie } from '@/features/memories';
import { setPlanOpen, usePlanOpen, usePlanStatus } from '@/features/outhere';
import { cn } from '@/features/ui';
import { DEMO_CENTER, haversineMeters, type FriendPin, type LatLng, type Quest } from '@/shared';
import { loadModels } from './characters';
import { applyCityTheme, BUILDINGS_ID, tileSourceId } from './cityTheme';
import { buildHq, loadHq, type HqLabel } from './hq';
import { blockerTest, nearestOnLines, nearestOpen, placeTrees, type Area, type Street } from './trees';
import {
  ARRIVE_METERS, buildingFlatten, CHARACTER_MIN_ZOOM, DEMO_WALK_SPEEDUP, ENTER_ZOOM, EXIT_3D_ZOOM, FAR_FROM_DEMO_M, MAX_3D_PITCH, MAX_3D_ZOOM,
  bearingDeg, characterScale, lerpDeg, minutesLeft, moveMeters, normalizeDeg, pitchForZoom, stepToward,
} from './math';
import { StadiumLabels } from './StadiumLabels';
import { stadiumLabels } from './stadiums';
import { useGps } from './useGps';
import { WorldLayer, type BeaconSpec } from './WorldLayer';

export type World3DProps = {
  map: MapLibreMap;
  viewer: { id: string; name: string };
  /** Where the demo walk starts: the viewer's home on the seeded map. */
  home: LatLng | null;
  quests: Quest[];
  picks: string[] | null;
  selectedId: string | null;
  friendPins: FriendPin[];
  onSelect: (questId: string) => void;
  onOpenFriend: (friendId: string) => void;
  /** 3D could not run well here; the parent switches back to the map. */
  onExit: (reason: 'slow') => void;
  /** A hand pinch/scroll ended zoomed out past EXIT_3D_ZOOM: the parent hands over to the 2D map. */
  onZoomOut?: () => void;
};

type Source = 'demo' | 'gps';
type PetMode = 'follow' | 'front';
type Walk = { questId: string; title: string; emoji: string; to: LatLng };
type NearFriend = { id: string; label: string };

/** Real walking speed (80 m/min) sped up for the demo walk. */
const WALK_MPS = (80 / 60) * DEMO_WALK_SPEEDUP;
const STICK_MPS = 9;
const TURN_DPS = 120;
const FRIEND_RADIUS_M = 600;
const FRIEND_CAP = 12;
const CATEGORY_COLOR: Record<Quest['category'], string> = {
  food: '#FF7A00', music: '#8A3FFC', sports: '#24A148', study: '#0866FF', thrift: '#D12771',
  art: '#E8505B', outdoors: '#00A3A3', games: '#F2A900', other: '#65676B',
};

const firstName = (name: string) => name.split(' ')[0] ?? name;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function World3D({ map, viewer, home, quests, picks, selectedId, friendPins, onSelect, onOpenFriend, onExit, onZoomOut }: World3DProps) {
  const layerRef = useRef<WorldLayer | null>(null);
  const [ready, setReady] = useState(false);
  /** Meta HQ: building labels, the campus box (no generated trees inside it), and the tour. */
  const [hqLabels, setHqLabels] = useState<HqLabel[]>([]);
  const hqBox = useRef<number[][] | null>(null);
  const hqFlatten = useRef<((f: number) => void) | null>(null);
  const [tour, setTour] = useState<string | null>(null);
  const tourToken = useRef(0);
  const touring = useRef(false);
  const start = home ?? DEMO_CENTER;
  const pos = useRef<LatLng>(start);
  const heading = useRef(0);
  const camBearing = useRef(map.getBearing());
  const moved = useRef(false);
  /** Inside a building or water? From the tiles around the avatar, refreshed with the trees. */
  const blockedRef = useRef<((p: LatLng) => boolean) | null>(null);
  /** The start position changed: the next tree refresh re-checks it against the buildings. */
  const snapPending = useRef(true);
  const homeRef = useRef(home);
  homeRef.current = home;
  const followRef = useRef(false);
  /** While true, following also eases the zoom down to street level (the fly-in). */
  const entering = useRef(true);
  const [follow, setFollowState] = useState(false);
  const setFollow = useCallback((v: boolean) => { followRef.current = v; setFollowState(v); }, []);
  const keys = useRef(new Set<string>());
  const stick = useRef({ x: 0, y: 0 });
  const walkRef = useRef<Walk | null>(null);
  const [walk, setWalkState] = useState<Walk | null>(null);
  const setWalk = useCallback((w: Walk | null) => { walkRef.current = w; setWalkState(w); }, []);
  const [walkMin, setWalkMin] = useState<number | null>(null);
  const [arrival, setArrival] = useState<{ id: string; text: string } | null>(null);
  const arrived = useRef(new Set<string>());
  const [source, setSourceState] = useState<Source>('demo');
  const sourceRef = useRef<Source>('demo');
  const gps = useGps(source === 'gps');
  const [farKm, setFarKm] = useState<number | null>(null);
  const [nearFriends, setNearFriends] = useState<NearFriend[]>([]);
  const nearKey = useRef('');
  const [, setSecond] = useState(0);
  const questsRef = useRef(quests);
  questsRef.current = quests;
  const friendsRef = useRef(friendPins);
  friendsRef.current = friendPins;
  const onZoomOutRef = useRef(onZoomOut);
  onZoomOutRef.current = onZoomOut;

  // ---- Muse pet: what it says and where it floats ----
  const planOpen = usePlanOpen();
  const plan = usePlanStatus();
  const petMode = useRef<PetMode>('follow');
  const petState = useRef('hover');
  const petPos = useRef<LatLng>(start);
  const petAlt = useRef(1.7);
  const [hello, setHello] = useState(true);
  const [showReason, setShowReason] = useState(false);
  const [cheer, setCheer] = useState<string | null>(null);
  useEffect(() => { const t = window.setTimeout(() => setHello(false), 7000); return () => window.clearTimeout(t); }, []);
  useEffect(() => {
    setShowReason(false);
    if (plan.state !== 'done' || !plan.topReason) return;
    const t = window.setTimeout(() => setShowReason(true), 6000);
    return () => window.clearTimeout(t);
  }, [plan.state, plan.summary, plan.topReason]);
  useEffect(() => {
    if (!cheer) return;
    const t = window.setTimeout(() => setCheer(null), 3500);
    return () => window.clearTimeout(t);
  }, [cheer]);

  const bubble: { text: string; tone: 'muse' | 'plain'; pending?: boolean } | null = cheer
    ? { text: cheer, tone: 'plain' }
    : plan.state === 'loading'
      ? { text: 'Checking who’s free and what fits…', tone: 'plain', pending: true }
      : plan.state === 'done' && planOpen
        ? { text: clip(showReason && plan.topReason ? plan.topReason : (plan.summary || plan.topTitle || 'Here’s what I found.'), 150), tone: plan.live ? 'muse' : 'plain' }
        : plan.state === 'error' && planOpen
          ? { text: plan.error ?? 'I couldn’t make a plan right now.', tone: 'plain' }
          : planOpen
            ? { text: 'What are you up for?', tone: 'plain' }
            : hello
              ? { text: `Hi ${firstName(viewer.name)}! Tap ✨ I’m free and I’ll find something nearby.`, tone: 'plain' }
              : null;
  const nextPetMode: PetMode = planOpen || plan.state === 'loading' || cheer ? 'front' : 'follow';
  const nextPetState = cheer ? 'happy' : plan.state === 'loading' ? 'think' : bubble && nextPetMode === 'front' ? 'talk' : 'hover';
  petMode.current = nextPetMode;
  petState.current = nextPetState;

  // ---- Set up the 3D map, and put it back on the way out ----
  useEffect(() => {
    const saved = { maxZoom: map.getMaxZoom(), maxPitch: map.getMaxPitch() };
    let layer: WorldLayer | null = null;
    let undoTheme: (() => void) | null = null;
    let cancelled = false;
    map.setMaxPitch(MAX_3D_PITCH);
    map.setMaxZoom(MAX_3D_ZOOM);
    map.dragRotate.enable();
    map.touchZoomRotate.enable({ around: 'center' });
    map.touchZoomRotate.enableRotation();
    map.scrollZoom.enable({ around: 'center' });
    map.getContainer().setAttribute('data-view3d', '');
    // One camera: on every update (pinch, scroll, animation, the follow loop) the tilt comes from
    // the zoom, so zooming out lifts the camera to the overhead map in one continuous motion.
    // The HQ tour sets its own angles.
    map.setTransformCameraUpdate((next) => (touring.current ? {} : { pitch: pitchForZoom(next.zoom) }));
    // Dev only: lets tests and debugging read the live map (never in a production build).
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __ohMap?: MapLibreMap }).__ohMap = map;

    let added = false;
    const add = () => {
      if (cancelled || added) return;
      // isStyleLoaded() also waits for tiles, and 'load' may have fired before this mounted:
      // add as soon as the style's layers exist, from whichever event comes first.
      let style: ReturnType<MapLibreMap['getStyle']>;
      try { style = map.getStyle(); } catch { return; }
      if (!style?.layers?.length) return;
      added = true;
      // Real OSM buildings in 3D, green spaces, water, streets and sky (cityTheme.ts).
      undoTheme = applyCityTheme(map);
      layer = new WorldLayer(pos.current);
      layer.minZoom = CHARACTER_MIN_ZOOM;
      map.addLayer(layer);
      layer.upsertActor('me', 'avatar', viewer.id);
      layer.upsertActor('pet', 'pet', viewer.id);
      layerRef.current = layer;
      setReady(true);
      void loadModels().then((models) => { if (!cancelled && (models.avatar || models.pet)) layer?.setModels(models); });

      // Follow the avatar and ease down to street level behind it (see `entering` in the loop).
      heading.current = normalizeDeg(map.getBearing());
      camBearing.current = heading.current;
      entering.current = true;
      setFollow(true);
    };
    add();
    map.on('load', add);
    map.on('styledata', add);
    map.on('idle', add);

    // Dragging or rotating the map by hand looks around; "Back to me" follows again.
    const detach = (e: { originalEvent?: unknown }) => { if (e.originalEvent) { entering.current = false; stopTour(); setFollow(false); } };
    // A pinch or scroll by hand ends the fly-in, so zooming out to the city is never undone.
    const userZoom = (e: { originalEvent?: unknown }) => { if (e.originalEvent) { entering.current = false; stopTour(); } };
    // Zoomed out to city level hands over to the 2D map (one zoom, two views). Only the fly-in and
    // the HQ tour move the zoom on their own, and neither zooms out, so any other zoom that ends
    // out here was the viewer's. (The follow loop's own camera calls end zooms mid-gesture, so a
    // per-gesture "by hand" flag would miss the last one.)
    const zoomEnd = () => {
      if (!entering.current && !touring.current && map.getZoom() < EXIT_3D_ZOOM) onZoomOutRef.current?.();
    };
    map.on('dragstart', detach);
    map.on('rotatestart', detach);
    map.on('zoomstart', userZoom);
    map.on('zoomend', zoomEnd);

    return () => {
      cancelled = true;
      map.off('load', add);
      map.off('styledata', add);
      map.off('idle', add);
      map.off('dragstart', detach);
      map.off('rotatestart', detach);
      map.off('zoomstart', userZoom);
      map.off('zoomend', zoomEnd);
      if (layer && map.getLayer(layer.id)) map.removeLayer(layer.id);
      undoTheme?.();
      layerRef.current = null;
      map.getContainer().removeAttribute('data-view3d');
      map.setTransformCameraUpdate(null);
      map.dragRotate.disable();
      map.touchZoomRotate.enable();
      map.touchZoomRotate.disableRotation();
      map.scrollZoom.enable();
      map.easeTo({ pitch: 0, bearing: 0, zoom: Math.min(map.getZoom(), 16), duration: reducedMotion() ? 0 : 700 });
      // Put the 2D limits back once the camera has settled, unless the 3D view came straight back
      // (React's dev double mount, or a quick Map → 3D): then its limits must stay.
      map.once('moveend', () => {
        if (map.getContainer().hasAttribute('data-view3d')) return;
        map.setMaxPitch(saved.maxPitch);
        map.setMaxZoom(saved.maxZoom);
      });
    };
    // One setup per map; viewer.id only seeds the avatar colors.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Home arrives after the first render: start the demo walk there if nothing moved yet.
  // A home inside a building outline starts on the nearest open ground instead (the tree refresh
  // repeats this once the buildings around it have loaded).
  useEffect(() => {
    if (!home || moved.current || sourceRef.current !== 'demo') return;
    pos.current = blockedRef.current ? nearestOpen(home, blockedRef.current) : home;
    petPos.current = pos.current;
    snapPending.current = true;
  }, [home]);

  // ---- Keyboard: arrows / WASD walk forward-back and turn ----
  useEffect(() => {
    const map: Record<string, string> = { ArrowUp: 'f', w: 'f', W: 'f', ArrowDown: 'b', s: 'b', S: 'b', ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r' };
    const down = (e: KeyboardEvent) => {
      if (typing(e.target) || !map[e.key]) return;
      keys.current.add(map[e.key]);
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => { if (map[e.key]) keys.current.delete(map[e.key]); };
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);

  // ---- Plan beacons and stadiums (#23): an arena with one seat per spot under each beam ----
  useEffect(() => {
    const strong = new Set([...(picks ?? []), ...(selectedId ? [selectedId] : [])]);
    const pickSet = new Set(picks ?? []);
    const specs: BeaconSpec[] = quests
      .filter((q) => q.status !== 'done' && q.capacity - q.memberIds.length > 0)
      .map((q) => ({
        id: q.id, pos: q.location, strong: strong.has(q.id),
        color: strong.has(q.id) ? '#0866FF' : CATEGORY_COLOR[q.category] ?? '#65676B',
        height: strong.has(q.id) ? 90 : 45,
        capacity: q.capacity, taken: q.memberIds.length, pick: pickSet.has(q.id),
      }));
    layerRef.current?.setBeacons(specs);
  }, [quests, picks, selectedId, ready]);

  // ---- Joining a plan: the avatar and the pet celebrate ----
  const joined = useRef<Set<string> | null>(null);
  useEffect(() => {
    const mine = new Set(quests.filter((q) => q.memberIds.includes(viewer.id)).map((q) => q.id));
    const before = joined.current;
    joined.current = mine;
    if (!before) return;
    const fresh = [...mine].find((id) => !before.has(id));
    if (!fresh) return;
    const q = quests.find((x) => x.id === fresh);
    layerRef.current?.setState('me', 'celebrate');
    setCheer(q ? `You’re in! ${q.emoji} ${q.title}. I’ll keep your seat.` : 'You’re in!');
  }, [quests, viewer.id]);

  /** One step of free walking that slides along walls instead of entering a building. */
  const tryMove = useCallback((p: LatLng, meters: number, bearing: number): LatLng => {
    const next = moveMeters(p, meters, bearing);
    const blocked = blockedRef.current;
    if (!blocked || !blocked(next) || blocked(p)) return next; // already inside (GPS indoors): let them out
    const r = (bearing * Math.PI) / 180;
    const across = moveMeters(p, Math.abs(Math.sin(r) * meters), Math.sin(r) * meters >= 0 ? 90 : 270);
    if (!blocked(across)) return across;
    const along = moveMeters(p, Math.abs(Math.cos(r) * meters), Math.cos(r) * meters >= 0 ? 0 : 180);
    return blocked(along) ? p : along;
  }, []);

  // ---- Meta HQ in detail (hq.ts): real footprints, floors, facades, rooftop park, mapped trees ----
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let dispose: (() => void) | null = null;
    void loadHq().then((data) => {
      const layer = layerRef.current;
      if (cancelled || !data || !layer) return;
      const model = buildHq(data, layer.getOrigin());
      layer.setStatic('hq', model.group);
      dispose = model.dispose;
      hqFlatten.current = model.setFlatten;
      // The map's plain boxes for these buildings would poke through the models: hide them
      // (OpenMapTiles building ids are the OSM way id × 10).
      if (map.getLayer(BUILDINGS_ID)) map.setFilter(BUILDINGS_ID, ['!', ['in', ['id'], ['literal', model.wayIds.map((id) => id * 10)]]]);
      const b = data.box;
      hqBox.current = [[b.w, b.s], [b.e, b.s], [b.e, b.n], [b.w, b.n], [b.w, b.s]];
      setHqLabels(model.labels);
    });
    return () => {
      cancelled = true;
      layerRef.current?.setStatic('hq', null);
      hqFlatten.current = null;
      dispose?.();
      if (map.getLayer(BUILDINGS_ID)) map.setFilter(BUILDINGS_ID, null);
      hqBox.current = null;
    };
  }, [map, ready]);

  const stopTour = useCallback(() => {
    if (!touring.current) return;
    tourToken.current += 1;
    touring.current = false;
    setTour(null);
    map.stop();
  }, [map]);

  /** Orbit the classic campus (MPK 10–18), then MPK 20's rooftop park, with captions. */
  const startTour = useCallback(async () => {
    const at = (re: RegExp) => hqLabels.filter((l) => re.test(l.name));
    const center = (ls: HqLabel[]) => ls.length
      ? { lng: ls.reduce((a, l) => a + l.pos.lng, 0) / ls.length, lat: ls.reduce((a, l) => a + l.pos.lat, 0) / ls.length }
      : null;
    const classic = center(at(/^MPK 1\d$/));
    const mpk20 = center(at(/^MPK 20$/));
    const stops = [
      classic && { at: classic, zoom: 17.4, pitch: 58, caption: 'Classic campus at 1 Hacker Way: MPK 10–18 around Hacker Square' },
      mpk20 && { at: mpk20, zoom: 17.1, pitch: 55, caption: 'MPK 20: Frank Gehry’s building with a 9-acre rooftop park' },
    ].filter(Boolean) as { at: LatLng; zoom: number; pitch: number; caption: string }[];
    if (stops.length === 0) return;
    const token = ++tourToken.current;
    touring.current = true;
    entering.current = false;
    setFollow(false);
    const quick = reducedMotion();
    const run = (start: () => void) => new Promise<void>((resolve) => { map.once('moveend', () => resolve()); start(); });
    for (const st of stops) {
      if (token !== tourToken.current) return;
      setTour(st.caption);
      await run(() => map.flyTo({ center: [st.at.lng, st.at.lat], zoom: st.zoom, pitch: st.pitch, bearing: map.getBearing(), duration: quick ? 0 : 2600, essential: true }));
      if (token !== tourToken.current) return;
      await run(() => map.rotateTo(map.getBearing() + 220, { duration: quick ? 0 : 13000, easing: (t) => t }));
    }
    if (token !== tourToken.current) return;
    touring.current = false;
    setTour(null);
    entering.current = true;
    setFollow(true);
  }, [hqLabels, map, setFollow]);

  // ---- Trees: placed from the tiles around the avatar; again after moving 250 m or new tiles ----
  useEffect(() => {
    if (!ready) return;
    let source: string | null = null;
    let center: LatLng | null = null;
    let dirty = true;
    const onData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => { if (e.sourceId === source && e.isSourceLoaded) dirty = true; };
    map.on('sourcedata', onData);
    const polys = (f: GeoJSON.Feature): number[][][][] =>
      f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    const lines = (f: GeoJSON.Feature): number[][][] =>
      f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [];
    const refresh = () => {
      const layer = layerRef.current;
      source ??= tileSourceId(map);
      if (!layer || !source) return;
      const farFromLast = !center || haversineMeters(center, pos.current) > 250;
      if (!farFromLast && !dirty && !snapPending.current) return;
      snapPending.current = false;
      dirty = false;
      center = pos.current;
      const q = (sourceLayer: string, classes: string[]) => map.querySourceFeatures(source!, {
        sourceLayer, filter: ['match', ['get', 'class'], classes, true, false],
      });
      const areas: Area[] = [
        ...q('landcover', ['wood']).flatMap((f) => polys(f).map((rings) => ({ rings, spacing: 9 }))),
        ...q('landcover', ['grass', 'wetland']).flatMap((f) => polys(f).map((rings) => ({ rings, spacing: 24 }))),
        ...q('landuse', ['park', 'cemetery']).flatMap((f) => polys(f).map((rings) => ({ rings, spacing: 18 }))),
        ...map.querySourceFeatures(source, { sourceLayer: 'park' }).flatMap((f) => polys(f).map((rings) => ({ rings, spacing: 18 }))),
      ];
      const streets: Street[] = [
        ...q('transportation', ['minor', 'service']).flatMap((f) => lines(f).map((coords) => ({ coords, spacing: 16, offset: 7 }))),
        ...q('transportation', ['tertiary', 'secondary', 'primary']).flatMap((f) => lines(f).map((coords) => ({ coords, spacing: 18, offset: 12 }))),
      ];
      const buildings = map.querySourceFeatures(source, { sourceLayer: 'building' }).flatMap((f) => polys(f));
      const water = map.querySourceFeatures(source, { sourceLayer: 'water' }).flatMap((f) => polys(f));
      // No trees on sports fields, playgrounds or in the water.
      const blockers = [...buildings, ...q('landuse', ['pitch', 'playground', 'track', 'stadium']).flatMap((f) => polys(f)), ...water,
        // Meta HQ has its real, mapped trees (hq.ts); no generated ones there.
        ...(hqBox.current ? [[hqBox.current]] : [])];
      // You can't walk into a building or the bay. The demo walk starts on open ground.
      blockedRef.current = blockerTest([...buildings, ...water]);
      if (sourceRef.current === 'demo' && !moved.current) {
        // Start on the nearest street or footpath (a home inside a campus courtyard reads as a
        // rooftop from the low camera), and never inside a building.
        const start = homeRef.current ?? DEMO_CENTER;
        const roads = q('transportation', ['minor', 'tertiary', 'secondary']).flatMap((f) => lines(f));
        const paths = q('transportation', ['service', 'path']).flatMap((f) => lines(f));
        const onStreet = nearestOnLines(start, roads, 250) ?? nearestOnLines(start, paths, 150) ?? start;
        pos.current = nearestOpen(onStreet, blockedRef.current);
        petPos.current = pos.current;
      }
      layer.setTrees(placeTrees({ origin: DEMO_CENTER, center: pos.current, radiusM: 700, cap: 700, areas, streets, blockers }));
    };
    refresh();
    const t = window.setInterval(refresh, 1500);
    return () => { window.clearInterval(t); map.off('sourcedata', onData); };
  }, [map, ready]);

  // ---- The frame loop: movement, the pet, friends, the camera ----
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let slowFor = 0;
    let lastNear = 0;
    let lastCheck = 0;
    let lastMin: number | null = null;
    let lastMe = '';
    let lastPet = '';
    let lastSecond = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const layer = layerRef.current;
      if (!layer) return;

      // Too slow for this device: hand back to the 2D map.
      slowFor = dt > 0.05 ? slowFor + dt : 0;
      if (slowFor > 4) { onExit('slow'); return; }

      // Movement
      let moving = false;
      const zoom = map.getZoom();
      const scale = characterScale(zoom);
      if (sourceRef.current === 'gps') {
        const fix = gps.reading.current.fix;
        if (fix) {
          const d = haversineMeters(pos.current, fix);
          if (d > 0.5) {
            const k = 1 - Math.exp(-dt * 3);
            const b = bearingDeg(pos.current, fix);
            pos.current = moveMeters(pos.current, d * k, b);
            moving = d > 1.5;
            if (moving && gps.reading.current.heading == null) heading.current = lerpDeg(heading.current, b, 1 - Math.exp(-dt * 6));
          }
          const h = gps.reading.current.heading;
          if (h != null) heading.current = lerpDeg(heading.current, h, 1 - Math.exp(-dt * 6));
        }
      } else {
        const k = keys.current;
        const turn = (k.has('r') ? 1 : 0) - (k.has('l') ? 1 : 0);
        const fwd = (k.has('f') ? 1 : 0) - (k.has('b') ? 1 : 0);
        const s = stick.current;
        const mag = Math.min(1, Math.hypot(s.x, s.y));
        if (turn || fwd || mag > 0.15) {
          if (walkRef.current) setWalk(null);
          if (!followRef.current) setFollow(true);
          moved.current = true;
        }
        if (turn) heading.current = normalizeDeg(heading.current + turn * TURN_DPS * dt);
        if (fwd) { pos.current = tryMove(pos.current, fwd * STICK_MPS * dt, heading.current); moving = true; }
        if (mag > 0.15) {
          const dir = normalizeDeg(camBearing.current + (Math.atan2(s.x, -s.y) * 180) / Math.PI);
          heading.current = lerpDeg(heading.current, dir, 1 - Math.exp(-dt * 10));
          pos.current = tryMove(pos.current, STICK_MPS * mag * dt, heading.current);
          moving = true;
        }
        const w = walkRef.current;
        if (w && !moving) {
          const step = stepToward(pos.current, w.to, WALK_MPS * dt);
          pos.current = step.pos;
          heading.current = lerpDeg(heading.current, step.heading, 1 - Math.exp(-dt * 8));
          moving = true;
          moved.current = true;
          if (step.arrived) {
            setWalk(null);
            moving = false;
            arrived.current.add(w.questId);
            layer.setState('me', 'wave');
            setArrival({ id: w.questId, text: `You’re at ${w.emoji} ${w.title}` });
            onSelect(w.questId);
          }
        }
      }
      const meState = moving ? 'walk' : 'idle';
      if (meState !== lastMe) { layer.setState('me', meState); lastMe = meState; }
      layer.setPose('me', pos.current, heading.current, 0);

      // The pet: at your shoulder, or in front of you facing the camera while it talks.
      const front = petMode.current === 'front';
      const offBearing = front ? heading.current : heading.current + 125;
      const offMeters = (front ? 1.6 : 1.1) * scale;
      const target = moveMeters(pos.current, offMeters, offBearing);
      const gap = haversineMeters(petPos.current, target);
      const kp = 1 - Math.exp(-dt * 5);
      petPos.current = gap > 0.05 ? moveMeters(petPos.current, gap * kp, bearingDeg(petPos.current, target)) : target;
      petAlt.current += ((front ? 2.0 : 1.55) - petAlt.current) * kp;
      const flying = gap > 2.5 * scale;
      const pState = flying ? 'fly' : petState.current;
      if (pState !== lastPet) { layer.setState('pet', pState); lastPet = pState; }
      layer.setPose('pet', petPos.current, front ? normalizeDeg(camBearing.current + 180) : heading.current, petAlt.current);

      // Friends near you become avatars (nearest few), the rest stay as map pins.
      if (now - lastNear > 1000) {
        lastNear = now;
        const near = friendsRef.current
          .map((p) => ({ p, d: haversineMeters(pos.current, p.location) }))
          .filter((x) => x.d <= FRIEND_RADIUS_M)
          .sort((a, b) => a.d - b.d)
          .slice(0, FRIEND_CAP);
        const ids = new Set(near.map((x) => `f:${x.p.friend.id}`));
        for (const id of layer.actorIds()) if (id.startsWith('f:') && !ids.has(id)) layer.removeActor(id);
        for (const { p } of near) {
          const id = `f:${p.friend.id}`;
          layer.upsertActor(id, 'avatar', p.friend.id);
          layer.setPose(id, p.location, bearingDeg(p.location, pos.current), 0);
        }
        const key = near.map((x) => `${x.p.friend.id}:${x.p.bubble.emoji ?? ''}${x.p.bubble.thought ?? ''}`).join('|');
        if (key !== nearKey.current) {
          nearKey.current = key;
          setNearFriends(near.map(({ p }) => {
            const t = p.bubble.thought ?? p.bubble.doing;
            return { id: p.friend.id, label: `${p.bubble.emoji ? `${p.bubble.emoji} ` : ''}${firstName(p.friend.name)}${t ? ` · ${clip(t, 22)}` : ''}` };
          }));
        }
      }

      // Arrival at any plan you walk into; the walking countdown.
      if (now - lastCheck > 250) {
        lastCheck = now;
        for (const q of questsRef.current) {
          const d = haversineMeters(pos.current, q.location);
          if (d <= ARRIVE_METERS && !arrived.current.has(q.id)) {
            arrived.current.add(q.id);
            if (!walkRef.current) setArrival({ id: q.id, text: `You’re at ${q.emoji} ${q.title}` });
          } else if (d > ARRIVE_METERS * 3) arrived.current.delete(q.id);
        }
        const w = walkRef.current;
        const m = w ? minutesLeft(pos.current, w.to) : null;
        if (m !== lastMin) { lastMin = m; setWalkMin(m); }
      }
      if (now - lastSecond > 1000) { lastSecond = now; setSecond((n) => n + 1); }

      // Camera: behind the avatar while following. The tilt is set from the zoom on every camera
      // update by transformCameraUpdate (setup effect), so it changes smoothly during a pinch or
      // scroll. Any camera call stops MapLibre's gestures, so following waits out a user zoom.
      hqFlatten.current?.(buildingFlatten(zoom));
      if (touring.current) return; // the HQ tour drives the camera
      const busy = map.isZooming() || (!followRef.current && map.isMoving());
      if (followRef.current && !busy) {
        let z = zoom;
        if (entering.current) {
          z = reducedMotion() ? ENTER_ZOOM : zoom + (ENTER_ZOOM - zoom) * (1 - Math.exp(-dt * 2.2));
          if (Math.abs(ENTER_ZOOM - z) < 0.02) { z = ENTER_ZOOM; entering.current = false; }
        }
        camBearing.current = lerpDeg(camBearing.current, heading.current, 1 - Math.exp(-dt * 2.5));
        const h = map.getContainer().clientHeight;
        map.easeTo({ center: [pos.current.lng, pos.current.lat], zoom: z, bearing: camBearing.current, offset: [0, Math.round(h * 0.2)], duration: 0 });
      } else if (!busy) {
        camBearing.current = map.getBearing();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [map, gps.reading, onExit, onSelect, setFollow, setWalk, tryMove]);

  // ---- GPS source ----
  const chooseSource = async (next: Source) => {
    if (next === 'gps') await gps.requestCompass();
    sourceRef.current = next;
    setSourceState(next);
    setWalk(null);
    if (next === 'demo') { pos.current = home ?? DEMO_CENTER; moved.current = false; setFarKm(null); }
    setFollow(true);
  };
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  useEffect(() => {
    if (gps.status !== 'denied' && gps.status !== 'unavailable') return;
    setGpsNote(gps.status === 'denied'
      ? 'Location is blocked for this site, so you’re on the demo walk.'
      : 'GPS isn’t available here, so you’re on the demo walk.');
    sourceRef.current = 'demo';
    setSourceState('demo');
  }, [gps.status]);
  useEffect(() => {
    if (!gpsNote) return;
    const t = window.setTimeout(() => setGpsNote(null), 6000);
    return () => window.clearTimeout(t);
  }, [gpsNote]);
  useEffect(() => {
    if (source !== 'gps' || gps.status !== 'on') return;
    const fix = gps.reading.current.fix;
    if (!fix) return;
    if (!moved.current) { pos.current = { lat: fix.lat, lng: fix.lng }; petPos.current = pos.current; moved.current = true; }
    const d = haversineMeters(fix, DEMO_CENTER);
    setFarKm(d > FAR_FROM_DEMO_M ? Math.round(d / 1000) : null);
  }, [source, gps.status, gps.reading]);

  const questWhere = useMemo(() => new Map(quests.map((q) => [q.id, q.location])), [quests]);

  // ---- Walk to the selected plan ----
  const selected = useMemo(() => quests.find((q) => q.id === selectedId) ?? null, [quests, selectedId]);
  const selectedMin = selected ? minutesLeft(pos.current, selected.location) : null;
  const canWalk = !!selected && source === 'demo' && walk?.questId !== selected.id && haversineMeters(pos.current, selected.location) > ARRIVE_METERS;
  const startWalk = () => {
    if (!selected) return;
    setArrival(null);
    setWalk({ questId: selected.id, title: selected.title, emoji: selected.emoji, to: selected.location });
    setFollow(true);
  };
  useEffect(() => {
    if (!arrival) return;
    const t = window.setTimeout(() => setArrival(null), 5000);
    return () => window.clearTimeout(t);
  }, [arrival]);
  // Arriving at a plan you joined opens the selfie (#47), once per plan in this visit.
  // A snapshot, not a live lookup: saving the photo completes the plan, which drops it from the map.
  const [selfieQuest, setSelfieQuest] = useState<Quest | null>(null);
  const selfieShown = useRef(new Set<string>());
  useEffect(() => {
    if (!arrival || selfieShown.current.has(arrival.id)) return;
    const q = questsRef.current.find((x) => x.id === arrival.id);
    if (!q?.memberIds.includes(viewer.id)) return;
    selfieShown.current.add(q.id);
    setSelfieQuest(q);
  }, [arrival, viewer.id]);
  // Closed while early: the selfie comes back when the plan starts, if you're still there.
  const selfieWaiting = useRef<Quest | null>(null);
  const closeSelfie = useCallback(() => {
    setSelfieQuest((q) => {
      selfieWaiting.current = q && new Date(q.startsAt).getTime() > Date.now() ? q : null;
      return null;
    });
  }, []);
  useEffect(() => {
    const t = window.setInterval(() => {
      const q = selfieWaiting.current;
      if (!q || new Date(q.startsAt).getTime() > Date.now()) return;
      selfieWaiting.current = null;
      if (haversineMeters(pos.current, q.location) <= ARRIVE_METERS * 3) setSelfieQuest(q);
    }, 5000);
    return () => window.clearInterval(t);
  }, []);

  const bindLabel = useCallback((id: string, lift?: number) => (el: HTMLElement | null) => {
    layerRef.current?.bindLabel(id, el, lift);
  }, []);

  const gpsLine = source !== 'gps' ? null
    : gps.status === 'asking' ? 'Finding you…'
      : gps.status === 'weak' ? 'GPS signal is weak here'
        : gps.status === 'on' ? `Live GPS · ±${Math.round(gps.reading.current.fix?.accuracy ?? 0)} m`
          : null;

  return (
    <div
      data-testid="world-3d"
      data-follow={follow ? 'true' : 'false'}
      data-source={source}
      data-zoom={map.getZoom().toFixed(1)}
      data-pitch={Math.round(map.getPitch())}
      data-lat={pos.current.lat.toFixed(5)}
      data-lng={pos.current.lng.toFixed(5)}
      className="pointer-events-none absolute inset-0 z-[5]"
    >
      {/* The blue home dot is replaced by the avatar while the 3D view is open. */}
      <style>{'[data-view3d] [data-map-marker="me"]{display:none}'}</style>

      {/* Labels the world layer keeps above heads: the pet's speech, friends' names and status. */}
      <div className="absolute inset-0 overflow-hidden">
        {bubble && (
          <div ref={bindLabel('pet', 0.15)} data-testid="pet-bubble" style={{ visibility: 'hidden' }} className="absolute left-0 top-0 pb-2">
            <button
              type="button"
              onClick={() => setPlanOpen(true)}
              className="pointer-events-auto relative block max-w-[260px] rounded-[18px] bg-fb-surface px-3 py-2 text-left text-[14px] leading-[18px] text-fb-text shadow-popover"
            >
              {bubble.tone === 'muse' && <span className="mb-0.5 block text-[12px] font-bold text-fb-blue">✨ Muse</span>}
              <span className={cn(bubble.pending && 'animate-pulse')}>{bubble.text}</span>
              <span aria-hidden className="absolute -bottom-[6px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-fb-surface" />
            </button>
          </div>
        )}
        {nearFriends.map((f) => (
          <div key={f.id} ref={bindLabel(`f:${f.id}`, 0.2)} style={{ visibility: 'hidden' }} className="absolute left-0 top-0">
            <button
              type="button"
              data-testid="world-friend"
              onClick={() => { layerRef.current?.setState('me', 'wave'); layerRef.current?.setState(`f:${f.id}`, 'wave'); onOpenFriend(f.id); }}
              className="pointer-events-auto whitespace-nowrap rounded-pill bg-fb-surface/95 px-2.5 py-1 text-[13px] font-semibold text-fb-text shadow-card hover:bg-fb-hover"
            >
              {f.label}
            </button>
          </div>
        ))}
      </div>

      {/* Building names at Meta HQ: while touring or looking from a distance. */}
      {(tour || map.getZoom() <= 18.3) && (
        <div className="absolute inset-0 overflow-hidden">
          {hqLabels.map((l) => (
            <div key={l.id} ref={(el) => layerRef.current?.bindAnchor(l.id, l.pos, l.altitude, el)} style={{ visibility: 'hidden' }} className="absolute left-0 top-0">
              <span data-testid="hq-label" className="block whitespace-nowrap rounded-pill bg-[#1C1E21]/85 px-2 py-0.5 text-[12px] font-bold text-white shadow-card">{l.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Quest stadiums: name, spots left and the walk from you, above each nearby arena. */}
      {ready && map.getZoom() >= CHARACTER_MIN_ZOOM && (
        <StadiumLabels
          labels={stadiumLabels(quests, pos.current, { picks, selectedId })}
          where={questWhere}
          layer={layerRef.current}
          onSelect={onSelect}
        />
      )}

      {/* Bottom centre: walking countdown, arrival, "Walk there", GPS notes. */}
      <div className={cn(
        'absolute inset-x-0 flex flex-col items-center gap-2 px-4',
        selectedId ? 'bottom-[calc(58%+12px)] md:bottom-24' : 'bottom-24 max-md:bottom-[252px]',
      )}>
        {tour && (
          <div role="status" data-testid="hq-tour-caption" className="pointer-events-auto flex max-w-[360px] items-center gap-2 rounded-card bg-[#1C1E21]/90 px-3 py-2 text-[14px] font-semibold text-white shadow-popover">
            <span>{tour}</span>
            <button type="button" onClick={() => { stopTour(); entering.current = true; setFollow(true); }} className="shrink-0 font-semibold text-[#8AB4FF] hover:underline">End tour</button>
          </div>
        )}
        {walk && walkMin != null && (
          <div role="status" data-testid="walk-countdown" className="pointer-events-auto flex items-center gap-2 rounded-pill bg-fb-surface px-3 py-1.5 text-[14px] font-semibold text-fb-text shadow-popover">
            <span aria-hidden>🚶</span>
            <span>{walkMin <= 1 ? 'Almost there' : `${walkMin} min`} to {walk.emoji} {clip(walk.title, 28)}</span>
            <button type="button" onClick={() => setWalk(null)} className="ml-1 font-semibold text-fb-blue hover:underline">Stop</button>
          </div>
        )}
        {arrival && !walk && !selfieQuest && (
          <div role="status" data-testid="arrival" className="pointer-events-auto rounded-pill bg-[#24A148] px-3 py-1.5 text-[14px] font-semibold text-white shadow-popover">
            📍 {arrival.text}
          </div>
        )}
        <ArrivalSelfie quest={selfieQuest} onClose={closeSelfie} />
        {canWalk && selected && !walk && (
          <button type="button" data-testid="walk-there" onClick={startWalk} className="pointer-events-auto h-10 rounded-pill bg-fb-blue px-4 text-[15px] font-semibold text-white shadow-popover hover:bg-fb-blue-hover">
            🚶 Walk there · {selectedMin} min
          </button>
        )}
        {farKm != null && (
          <p role="status" className="pointer-events-auto max-w-[340px] rounded-card bg-fb-surface px-3 py-2 text-center text-[13px] text-fb-text-2 shadow-card">
            You’re {farKm} km from Menlo Park, where the demo plans are.{' '}
            <button type="button" onClick={() => void chooseSource('demo')} className="font-semibold text-fb-blue hover:underline">Use the demo walk</button>
          </p>
        )}
        {gpsNote && <p role="status" data-testid="gps-note" className="rounded-pill bg-fb-surface px-3 py-1.5 text-[13px] text-fb-text-2 shadow-card">{gpsNote}</p>}
      </div>

      {/* Bottom right: the HQ tour, "Back to me", and the location source. */}
      <div className="absolute bottom-10 right-3 flex flex-col items-end gap-2 max-md:bottom-[136px]">
        {hqLabels.length > 0 && !tour && (
          <button type="button" data-testid="hq-tour" onClick={() => void startTour()} className="pointer-events-auto h-10 rounded-pill bg-fb-surface px-3 text-[14px] font-semibold text-fb-text shadow-popover hover:bg-fb-hover">
            🏢 Tour Meta HQ
          </button>
        )}
        {!follow && (
          <button type="button" data-testid="back-to-me" onClick={() => { stopTour(); entering.current = true; setFollow(true); }} className="pointer-events-auto h-10 rounded-pill bg-fb-surface px-3 text-[14px] font-semibold text-fb-text shadow-popover hover:bg-fb-hover">
            ◎ Back to me
          </button>
        )}
        <div role="group" aria-label="Where you are" className="pointer-events-auto flex gap-1 rounded-pill bg-fb-surface p-1 shadow-card">
          {(['demo', 'gps'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={source === s}
              data-testid={`location-${s}`}
              onClick={() => void chooseSource(s)}
              className={cn('h-8 rounded-pill px-3 text-[13px] font-semibold', source === s ? 'bg-fb-blue-tint text-fb-blue' : 'text-fb-text-2 hover:bg-fb-hover')}
            >
              {s === 'demo' ? '🕹️ Demo walk' : '📡 Live GPS'}
            </button>
          ))}
        </div>
        {gpsLine && <p className="rounded-pill bg-fb-surface px-2.5 py-1 text-[12px] text-fb-text-2 shadow-card">{gpsLine} · stays on this device</p>}
      </div>

      {/* Bottom left, above the view toggle: the joystick (demo walk only). */}
      {source === 'demo' && <Joystick stick={stick} />}
    </div>
  );
}

function Joystick({ stick }: { stick: MutableRefObject<{ x: number; y: number }> }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);
  const R = 40;
  const move = (e: ReactPointerEvent) => {
    if (active.current !== e.pointerId || !base.current) return;
    const r = base.current.getBoundingClientRect();
    let x = e.clientX - (r.left + r.width / 2);
    let y = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(x, y);
    if (d > R) { x = (x / d) * R; y = (y / d) * R; }
    setKnob({ x, y });
    stick.current = { x: x / R, y: y / R };
  };
  const end = () => { active.current = null; setKnob({ x: 0, y: 0 }); stick.current = { x: 0, y: 0 }; };
  return (
    <div className="absolute bottom-[88px] left-3 max-md:bottom-[136px]">
      <div
        ref={base}
        data-testid="joystick"
        aria-label="Walk: drag in a direction, or use the arrow keys"
        role="application"
        className="pointer-events-auto relative h-[104px] w-[104px] touch-none select-none rounded-full bg-fb-surface/80 shadow-card"
        onPointerDown={(e) => { active.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); move(e); }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div
          className="absolute left-1/2 top-1/2 h-11 w-11 rounded-full bg-fb-blue shadow-popover"
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
        />
      </div>
    </div>
  );
}
