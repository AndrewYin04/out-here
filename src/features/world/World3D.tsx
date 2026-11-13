'use client';
// The 3D street view of the Out Here map (docs/3D_VIEW_PLAN.md): a third-person camera behind the
// viewer's avatar, a Muse pet beside it, 3D buildings, plan beacons, nearby friends as avatars.
// Pinching out tilts the camera up continuously until it is the flat overhead map.
//
// Movement is local to this screen: the demo walk (joystick, arrow keys, "Walk there") or live
// GPS. Neither writes a position to the server; Find My keeps doing location sharing.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import { usePlanOpen, usePlanStatus, useUpNext } from '@/features/outhere';
import { useApi } from '@/features/data';
import type { ThreadView } from '@/shared/api';
import { FriendChat, type ChatFriend } from './FriendChat';
import { openChat as openMuseChat, minimizeChat, petPose, useMuseSnapshot, useAgentEncounter, finishAgentEncounter,attachMuseWorld,setMuseDockFrom,useMuseViewport,photoTargetForRender,useMuseActivity } from '@/features/muse-companion';
import { ArrivalSelfie, OPEN_SELFIE, TogetherMoment } from '@/features/memories';
import {photoFocusBearing} from '@/features/muse-vision';
import {museCameraArea, museConversationArea, museStage} from './muse-layout';
import {placeStreetFurniture} from './street-furniture';
import { CategoryIcon, categoryOf, cn, useDemoTools } from '@/features/ui';
import { Footprints, LocateFixed, MapPin, Sparkles, X } from 'lucide-react';

import { DEMO_CENTER, DEMO_CITY_STARTS, haversineMeters, type FriendPin, type LatLng, type Quest } from '@/shared';
import { EncounterMotion } from './encounter-motion';
import { loadModels } from './characters';
import { applyCityTheme, BUILDINGS_ID, tileSourceId } from './cityTheme';
import type { HqLabel } from './hq';
import { buildSfCity } from './sf-city';
import { blockerTest, nearestOnLines, nearestOpen, placeTrees, streetHeading,type Area, type Street } from './trees';
import {
  ARRIVE_METERS, CHARACTER_MIN_ZOOM, DEMO_WALK_SPEEDUP, ENTER_ZOOM, EXIT_3D_ZOOM, FAR_FROM_DEMO_M, MAX_3D_PITCH, MAX_3D_ZOOM,
  bearingDeg, characterScale, lerpDeg, minutesLeft, moveMeters, normalizeDeg, pitchForZoom, stepToward,
} from './math';
import { headThereLine, walkLine } from './museLines';
import { StadiumLabels } from './StadiumLabels';
import { MuseThoughts } from './MuseThoughts';
import { stadiumLabels } from './stadiums';
import { useGps } from './useGps';
import { useWalkTogether } from './useWalkTogether';
import { WorldLayer, type BeaconSpec } from './WorldLayer';

export type World3DProps = {
  map: MapLibreMap;
  viewer: { id: string; name: string; avatarUrl?: string };
  /** Where the demo walk starts: the viewer's home on the seeded map. */
  home: LatLng | null;
  quests: Quest[];
  picks: string[] | null;
  selectedId: string | null;
  friendPins: FriendPin[];
  onSelect: (questId: string | null) => void;
  /** Unused since tapping a friend opens the chat sheet; kept so callers still compile. */
  onOpenFriend?: (friendId: string) => void;
  /** 3D could not run well here; the parent switches back to the map. */
  onExit: (reason: 'slow') => void;
  /** A hand pinch/scroll ended zoomed out past EXIT_3D_ZOOM. */
  onZoomOut?: () => void;
  /** A joined plan requested from Up Next, even if its pin is filtered out. */
  walkTo?: Quest | null;
  onWalkStop?: (questId: string) => void;
  /** Called once when you arrive at a plan (walked there or walked into it). */
  onArrive?: (questId: string) => void;
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
/** Muse's hello follows where you are in the journey: no "tap I'm free" once you have a plan. */
function helloLine(name: string, next: ReturnType<typeof useUpNext>): string {
  if (!next) return `Hi ${name}. Tap me and I’ll find something nearby.`; // tapping Jolly opens the Muse chat
  const mins = Math.round((Date.parse(next.quest.startsAt) - Date.now()) / 60_000);
  const when = mins <= 0 ? 'is happening now' : `starts in ${mins} min`;
  return `${clip(next.quest.title, 28)} ${when}. Tap Let’s go and we’ll walk there.`;
}

export function World3D({ map, viewer, home, quests, picks, selectedId, friendPins, onSelect, onExit, onZoomOut, walkTo = null, onWalkStop, onArrive }: World3DProps) {
  const layerRef = useRef<WorldLayer | null>(null);
  const [ready, setReady] = useState(false);
  // Until the tilted map has drawn its first frame of streets, show a loading veil instead of a
  // grey void with floating pins (docs/UX_PLAN.md).
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!ready || settled) return;
    let done = false;
    const finish = () => { if (!done) { done = true; setSettled(true); } };
    map.once('idle', finish);
    const t = window.setTimeout(finish, 12_000);
    return () => { done = true; map.off('idle', finish); window.clearTimeout(t); };
  }, [ready, settled, map]);
  /** Meta HQ: building labels, the campus box (no generated trees inside it), and the tour. */
  const [hqLabels] = useState<HqLabel[]>([]);
  const cityBounds = useRef<number[][][]>([]);
  const cityContains = useRef<(p: LatLng) => boolean>(() => false);
  const cityBlocked = useRef<((p: LatLng) => boolean) | null>(null);
  const osmBlocked = useRef<(p: LatLng) => boolean>(() => false);
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
  const stopWalk = useCallback(() => {
    const questId = walkRef.current?.questId;
    setWalk(null);
    if (questId && !questId.startsWith('f:')) onWalkStop?.(questId);
  }, [onWalkStop, setWalk]);
  const [walkMin, setWalkMin] = useState<number | null>(null);
  const [arrival, setArrival] = useState<{ id: string; text: string } | null>(null);
  // The arrival photo is open: 3D must not drop to the 2D map under it (that would close it).
  const selfieOpenRef=useRef(false);
  useEffect(()=>attachMuseWorld(),[viewer.id]);
  const viewport=useMuseViewport(),viewportRef=useRef(viewport);viewportRef.current=viewport;
  const cameraRects=useRef<{bounds:DOMRect;panel:DOMRect|null;visible:{left:number;top:number;width:number;height:number}|null;area:ReturnType<typeof museCameraArea>}|null>(null);
  const manualChatCamera=useRef(false);
  const arrived = useRef(new Set<string>());
  const requestedWalk = useRef<Quest | null>(null);
  const [source, setSourceState] = useState<Source>('demo');
  const sourceRef = useRef<Source>('demo');
  const gps = useGps(source === 'gps');
  const [farKm, setFarKm] = useState<number | null>(null);
  const [nearFriends, setNearFriends] = useState<NearFriend[]>([]);
  const nearKey = useRef('');
  const streetHeadingSet=useRef(false);
  const [, setSecond] = useState(0);
  const questsRef = useRef(quests);
  questsRef.current = quests;
  const friendsRef = useRef(friendPins);
  // ---- Walking there together (#46): your steps out, the other members' walks in ----
  const walkQuests = useMemo(
    () => walkTo && !quests.some((q) => q.id === walkTo.id) ? [...quests, walkTo] : quests,
    [quests, walkTo],
  );
  const together = useWalkTogether(walkQuests, viewer.id, walk?.questId ?? null);
  const stepRef = useRef(together.step);
  stepRef.current = together.step;
  const walkersRef = useRef(together.walkers);
  walkersRef.current = together.walkers;
  /** Where each walker's avatar is drawn: it glides toward their latest reported position. */
  const walkerPos = useRef(new Map<string, { at: LatLng; heading: number; moving: boolean }>());
  friendsRef.current = friendPins;
  const onZoomOutRef = useRef(onZoomOut);
  onZoomOutRef.current = onZoomOut;

  // ---- Muse pet: what it says and where it floats ----
  const planOpen = usePlanOpen();
  const plan = usePlanStatus();
  // The Muse companion (chat): while it is open Jolly comes to the front and acts out its state.
  const companion = useMuseSnapshot();
  const activity = useMuseActivity();
  const [activityPresented,setActivityPresented]=useState(false);
  useEffect(()=>{
    if(!activity){setActivityPresented(false);return;}
    const measure=()=>{
      const nodes=document.querySelectorAll<HTMLElement>('[data-muse-activity-owner]');
      const visible=Array.from(nodes).some(node=>{if(node.dataset.museActivityOwner!==activity.owner||node.closest('[data-muse-world-bubble]'))return false;const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<window.innerHeight&&r.right>0&&r.left<window.innerWidth;});
      setActivityPresented(visible);
    };
    measure();const frame=requestAnimationFrame(measure);
    window.addEventListener('resize',measure,{passive:true});window.addEventListener('scroll',measure,{capture:true,passive:true});
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',measure);window.removeEventListener('scroll',measure,true);};
  },[activity]);
  const pose = petPose(companion);
  const encounter = useAgentEncounter();
  const encounterRef = useRef(encounter); encounterRef.current = encounter;
  const processing = useRef(companion.energy);
  processing.current = companion.energy;
  useEffect(()=>{
    const el=map.getContainer();let observedPanel:HTMLElement|null=null;
    const observer=new ResizeObserver(()=>measure());
    const measure=()=>{const panel=document.querySelector<HTMLElement>('[data-testid="muse-chat"]');if(panel!==observedPanel){if(observedPanel)observer.unobserve(observedPanel);if(panel)observer.observe(panel);observedPanel=panel;}const vv=window.visualViewport,bounds=el.getBoundingClientRect(),panelRect=panel?.getBoundingClientRect()??null,visible=vv?{left:vv.offsetLeft,top:vv.offsetTop,width:vv.width,height:vv.height}:null;cameraRects.current={bounds,panel:panelRect,visible,area:museCameraArea(bounds,[panelRect,viewportRef.current.occlusion],visible)};};
    observer.observe(el);measure();const frame=requestAnimationFrame(measure);
    window.addEventListener('resize',measure,{passive:true});window.addEventListener('scroll',measure,{capture:true,passive:true});
    window.visualViewport?.addEventListener('resize',measure);window.visualViewport?.addEventListener('scroll',measure);
    return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',measure);window.removeEventListener('scroll',measure,true);window.visualViewport?.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('scroll',measure);};
  },[map,companion.open,viewport]);
  // Faded map markers must also leave the tab order while Muse is the conversation focus.
  useEffect(()=>{
    if(!companion.open)return;
    const container=map.getContainer(),saved=new Map<HTMLElement,boolean>();
    const mute=()=>{for(const marker of container.querySelectorAll<HTMLElement>('.maplibregl-marker')){if(!saved.has(marker))saved.set(marker,marker.inert);marker.inert=true;}};
    mute();const observer=new MutationObserver(mute);observer.observe(container,{childList:true,subtree:true});
    return()=>{observer.disconnect();for(const [marker,inert] of saved)marker.inert=inert;};
  },[map,companion.open]);
  const chatOpen = useRef(companion.open);
  chatOpen.current = companion.open;
  useEffect(()=>{if(!companion.open&&manualChatCamera.current){map.setMaxZoom(MAX_3D_ZOOM);conversationCamera.current=false;}manualChatCamera.current=false;},[map,companion.open]);
  const upNext = useUpNext();
  const tools = useDemoTools();
  const petMode = useRef<PetMode>('follow');
  const petState = useRef('hover');
  const petBoost = useRef(1);
  const fidgetIn = useRef(24);
  const trickAt = useRef(0);
  const chatAreaHeight = useRef(450);
  const conversationCamera = useRef(false);
  const thoughtsRef = useRef<HTMLDivElement>(null);
  /** The Muse-to-Muse scene overlay: speech bubbles and the envelope, placed each frame. */
  const sceneRef = useRef<HTMLDivElement>(null);
  const petPos = useRef<LatLng>(start);
  const petAlt = useRef(1.7);
  const [hello, setHello] = useState(true);
  const [cheer, setCheer] = useState<string | null>(null);
  // The hello starts once the street view is on screen, not behind the loading veil.
  useEffect(() => { if (!settled) return; const t = window.setTimeout(() => setHello(false), 7000); return () => window.clearTimeout(t); }, [settled]);
  useEffect(() => {
    if (!cheer) return;
    const t = window.setTimeout(() => setCheer(null), 3500);
    return () => window.clearTimeout(t);
  }, [cheer]);

  // While walking Muse keeps you company with the live count; at leave-by it calls the moment.
  const walkingLine = walk && walkMin != null
    ? walkLine(walkMin, walk.emoji, walk.title, together.walkers.map((w) => w.name)) : null;
  const headLine = !walk && !planOpen && upNext
    ? headThereLine(upNext.quest.emoji ?? '✨', upNext.quest.title, Date.parse(upNext.quest.startsAt), upNext.walkMinutes, Date.now()) : null;

  const bubble: { text: string; tone: 'muse' | 'plain'; pending?: boolean } | null = companion.open
    ? null // the chat panel is talking; no second speech bubble
    : activity && !activityPresented && activity.outcome!=='cancelled'
      ? {text:clip(activity.message||activity.pending,100),tone:'muse',pending:!activity.outcome}
    : activity && activityPresented
      ? null
    : cheer
    ? { text: cheer, tone: 'plain' }
    : plan.state === 'loading'
      ? { text: 'Checking who’s free and what fits…', tone: 'plain', pending: true }
      : plan.state === 'done' && planOpen
        // The sheet below carries the summary and the reasons; Muse says each thing once.
        ? { text: plan.topTitle ? 'Your options are below.' : 'Nothing fits yet. Try a longer window.', tone: plan.live ? 'muse' : 'plain' }
        : plan.state === 'error' && planOpen
          ? { text: plan.error ?? 'I couldn’t make a plan right now.', tone: 'plain' }
          : walkingLine
            ? { text: walkingLine, tone: 'plain' }
            : headLine
              ? { text: headLine, tone: 'muse' }
              : planOpen
            ? { text: 'What are you up for?', tone: 'plain' }
            : hello
              ? { text: helloLine(firstName(viewer.name), upNext), tone: 'plain' }
              : null;
  const nextPetMode: PetMode = pose.front || planOpen || plan.state === 'loading' || cheer || walkingLine || headLine ? 'front' : 'follow';
  const nextPetState = cheer ? 'happy'
    : pose.clip !== 'hover' ? pose.clip
      : plan.state === 'loading' ? 'think' : bubble && nextPetMode === 'front' ? 'talk' : 'hover';

  petMode.current = nextPetMode;
  petState.current = nextPetState;

  // ---- Set up the 3D map, and put it back on the way out ----
  useEffect(() => {
    const saved = { maxZoom: map.getMaxZoom(), maxPitch: map.getMaxPitch(), fov:map.getVerticalFieldOfView(), pixelRatio:map.getPixelRatio() };
    let layer: WorldLayer | null = null;
    let undoTheme: (() => void) | null = null;
    let cancelled = false;
    map.setPixelRatio(Math.min(saved.pixelRatio, 1.5));
    map.setMaxPitch(MAX_3D_PITCH);
    map.setVerticalFieldOfView(48);
    map.setMaxZoom(MAX_3D_ZOOM);
    map.dragRotate.enable();
    map.touchZoomRotate.enable({ around: 'center' });
    map.touchZoomRotate.enableRotation();
    map.scrollZoom.enable({ around: 'center' });
    map.getContainer().setAttribute('data-view3d', '');
    // One camera: on every update (pinch, scroll, animation, the follow loop) the tilt comes from
    // the zoom, so zooming out lifts the camera to the overhead map in one continuous motion.
    // The HQ tour sets its own angles.
    map.setTransformCameraUpdate((next) => ((touring.current || conversationCamera.current) ? {} : { pitch: pitchForZoom(next.zoom) }));
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
      map.getContainer().dataset.worldModels='loading';
      void loadModels().then((models) => {
        if(cancelled)return;
        if(models.avatar||models.pet)layer?.setModels(models);
        map.getContainer().dataset.worldModels=models.pet?'ready':'fallback';
      });

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
    const detach = (e: { originalEvent?: unknown }) => { if (e.originalEvent) { if(chatOpen.current)manualChatCamera.current=true; if (encounterRef.current) finishAgentEncounter(encounterRef.current.id); entering.current = false; stopTour(); setFollow(false); } };
    // A pinch or scroll by hand ends the fly-in, so zooming out to the city is never undone.
    const userZoom = (e: { originalEvent?: unknown }) => { if (e.originalEvent) { if(chatOpen.current)manualChatCamera.current=true; entering.current = false; stopTour(); } };
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
      // Leaving 3D: note where Jolly is on screen, so on the map he flies out from there to his spot
      // at the side (MuseChat's docked Jolly).
      if (layer) {
        const p = { x: 0, y: 0, elevation: 0 }, r = map.getCanvas().getBoundingClientRect();
        if (layer.actorScreenPoint('pet', p) && p.x >= 0 && p.y >= 0 && p.x <= r.width && p.y <= r.height) setMuseDockFrom({ x: p.x + r.left, y: p.y + r.top });
        else setMuseDockFrom({ x: r.left + r.width / 2, y: r.top + r.height * 0.6 });
      }
      if (layer && map.getLayer(layer.id)) map.removeLayer(layer.id);
      undoTheme?.();
      layerRef.current = null;
      map.getContainer().removeAttribute('data-view3d');
      map.setPixelRatio(saved.pixelRatio);
      delete map.getContainer().dataset.worldModels;
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
        map.setMaxPitch(saved.maxPitch);map.setVerticalFieldOfView(saved.fov);
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
    setCheer(q ? `You’re in: ${q.title}. I’ll keep your seat.` : 'You’re in.');
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

  // ---- Detailed, instanced San Francisco demo districts in the existing world layer ----
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let dispose: (() => void) | null = null;
    let hideCityBuildings: (() => void) | null = null;
    const origin=layerRef.current?.getOrigin();
    if (!origin) return;
    void buildSfCity(origin,Object.entries(DEMO_CITY_STARTS).map(([id,center])=>({id,center}))).then(city=>{
      if (cancelled || !layerRef.current) { city.dispose(); return; }
      layerRef.current.setStatic('sf-city',city.group);
      dispose=city.dispose;cityBounds.current=city.bounds;
      cityContains.current=blockerTest(city.bounds.map(ring=>[ring]));
      cityBlocked.current=city.isBlocked;
      blockedRef.current=p=>cityContains.current(p)?city.isBlocked(p):osmBlocked.current(p);
      // Real downtown towers (OSM extrusions) would swallow the Kenney blocks: hide every building
      // with a corner inside a district, by id (MapLibre's 'within' does not filter polygons).
      // Re-checked when new tiles arrive; the colorful real skyline stays everywhere else.
      const hidden=new Set<number>();
      hideCityBuildings=()=>{
        const src=tileSourceId(map);if(!src||!map.getLayer(BUILDINGS_ID))return;
        const before=hidden.size;
        for(const f of map.querySourceFeatures(src,{sourceLayer:'building'})){
          if(f.id==null||hidden.has(Number(f.id)))continue;
          const g=f.geometry;const rings=g.type==='Polygon'?g.coordinates:g.type==='MultiPolygon'?g.coordinates.flat():[];
          if(rings.some(r=>r.some(([lng,lat])=>cityContains.current({lat,lng}))))hidden.add(Number(f.id));
        }
        if(hidden.size!==before||before===0)map.setFilter(BUILDINGS_ID,hidden.size?['!',['in',['id'],['literal',[...hidden]]]]:null);
      };
      hideCityBuildings();map.on('idle',hideCityBuildings);
      map.getContainer().dataset.worldCity='sf';
      map.getContainer().dataset.cityInstances=String(city.stats.instances);
      snapPending.current=true;
      if(!moved.current&&sourceRef.current==='demo'){
        const start=homeRef.current??DEMO_CENTER;
        if(cityContains.current(start)){pos.current=start;petPos.current=start;heading.current=0;streetHeadingSet.current=true;}
      }
    }).catch(()=>{ /* Keep the live map usable when a local scenery asset cannot load. */ });
    return()=>{
      cancelled=true;layerRef.current?.setStatic('sf-city',null);dispose?.();
      cityBounds.current=[];cityContains.current=()=>false;cityBlocked.current=null;
      blockedRef.current=osmBlocked.current;
      delete map.getContainer().dataset.worldCity;delete map.getContainer().dataset.cityInstances;
      if(hideCityBuildings)map.off('idle',hideCityBuildings);
      if(map.getLayer(BUILDINGS_ID))map.setFilter(BUILDINGS_ID,null);
    };
  },[map,ready]);

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
      const camera=map.getCenter(),focus=followRef.current?pos.current:{lat:camera.lat,lng:camera.lng};
      const farFromLast = !center || haversineMeters(center, focus) > 150;
      if (!farFromLast && !dirty && !snapPending.current) return;
      snapPending.current = false;
      dirty = false;
      center = focus;
      const q = (sourceLayer: string, classes: string[]) => map.querySourceFeatures(source!, {
        sourceLayer, filter: ['match', ['get', 'class'], classes, true, false],
      });
      const areas: Area[] = [
        ...q('landcover', ['wood']).flatMap((f) => polys(f).map((rings) => ({ rings, spacing: 13 }))),
        ...q('landcover', ['grass']).flatMap((f) => polys(f).map((rings) => ({ rings, spacing: 38 }))),
        ...q('landuse', ['park', 'cemetery']).flatMap((f) => polys(f).map((rings) => ({ rings, spacing: 25 }))),
        ...map.querySourceFeatures(source, { sourceLayer: 'park' }).flatMap((f) => polys(f).map((rings) => ({ rings, spacing: 25 }))),
      ];
      const streets: Street[] = [
        ...q('transportation', ['minor', 'service']).flatMap((f) => lines(f).map((coords) => ({ coords, spacing: 28, offset: 7,width:5.5 }))),
        ...q('transportation', ['tertiary', 'secondary', 'primary']).flatMap((f) => lines(f).map((coords) => ({ coords, spacing: 34, offset: 12,width:8 }))),
      ];
      streets.push(...q('transportation',['path','pedestrian','track']).flatMap(f=>lines(f).map(coords=>({coords,spacing:30,offset:3,width:2,trees:false}))));
      const buildings = map.querySourceFeatures(source, { sourceLayer: 'building' }).flatMap((f) => polys(f));
      const water = map.querySourceFeatures(source, { sourceLayer: 'water' }).flatMap((f) => polys(f));
      // No trees on sports fields, playgrounds or in the water.
      const blockers = [...buildings, ...q('landcover',['wetland']).flatMap(f=>polys(f)), ...q('landuse', ['pitch', 'playground', 'track', 'stadium']).flatMap((f) => polys(f)), ...water,
        // Authored city blocks already include trees, pavement and street props.
        ...cityBounds.current.map(ring=>[ring])];
      // You can't walk into a building or the bay. The demo walk starts on open ground.
      osmBlocked.current = blockerTest([...buildings, ...water]);
      blockedRef.current = p=>cityContains.current(p)?(cityBlocked.current?.(p)??false):osmBlocked.current(p);
      if (sourceRef.current === 'demo' && !moved.current) {
        // Start on the nearest street or footpath (a home inside a campus courtyard reads as a
        // rooftop from the low camera), and never inside a building.
        const start = homeRef.current ?? DEMO_CENTER;
        const roads = q('transportation', ['minor', 'tertiary', 'secondary']).flatMap((f) => lines(f));
        const paths = q('transportation', ['service', 'path']).flatMap((f) => lines(f));
        const onStreet = cityContains.current(start)?start:nearestOnLines(start, roads, 250) ?? nearestOnLines(start, paths, 150) ?? start;
        pos.current = nearestOpen(onStreet, blockedRef.current);
        petPos.current = pos.current;
        if(followRef.current&&!streetHeadingSet.current&&!cityContains.current(pos.current)){const aligned=streetHeading(pos.current,roads.length?roads:paths,heading.current);if(aligned!==null){heading.current=aligned;streetHeadingSet.current=true;}}
      }
      const spots=placeTrees({ origin: DEMO_CENTER, center: focus, radiusM: 650, cap: 480, areas, streets, blockers });layer.setTrees(spots);
      layer.setStreetFurniture(placeStreetFurniture({origin:DEMO_CENTER,center:focus,streets,blockers,radiusM:500,cap:48}).filter(lamp=>!spots.some(tree=>haversineMeters(lamp,tree)<3)));
    };
    refresh();
    const t = window.setInterval(refresh, 1500);
    return () => { window.clearInterval(t); map.off('sourcedata', onData); };
  }, [map, ready]);

  // ---- The frame loop: movement, the pet, friends, the camera ----
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const visualQA=process.env.NODE_ENV==='development'&&new URLSearchParams(window.location.search).get('worldQA')==='1';
    let slowFor = 0;
    let lastNear = 0;
    let lastCheck = 0;
    let lastMin: number | null = null;
    let lastMe = '';
    let lastPet = '';
    const walkerState = new Map<string, string>();
    let lastSecond = 0;
    let chatCamera: { center: [number, number]; zoom: number; bearing: number; elevation: number; pitch: number } | null = null;
    let returnCamera: { center: [number, number]; zoom: number; bearing: number; elevation: number; pitch: number } | null = null;
    let restoringUntil = 0;
    let previousCamera: number[] | null = null;
    const compose = (lng: number, lat: number, zoom: number, bearing: number, x: number, y: number, pitch = map.getPitch()) => {
      const values = [lng, lat, zoom, bearing, x, y, pitch];
      const tolerances = [1e-10, 1e-10, .0001, .001, .1, .1, .001];
      if (previousCamera && values.every((v, i) => Math.abs(v - previousCamera![i]) < tolerances[i])) return;
      previousCamera = values;
      map.easeTo({center: [lng, lat], zoom, bearing, pitch, offset: [x, y], duration: 0});
    };
    let flight: { id:number; peer:string; created:boolean; motion:EncounterMotion; origin:LatLng; altitude:number; scale:number; bearing:number; cursor:number; pulseAge:number;direction:'sent'|'received'|null;
      /** After the ask arrives, their Muse carries the envelope off to its person and back (0..1; -1 = not out). */
      deliver:number; delivered:boolean } | null = null;
    const clearFlight = () => {
      if (!flight) return;
      const layer=layerRef.current;
      if (flight.created) layer?.removeActor(flight.peer);
      layer?.setMuseTrailStyle('pet','walk');
      lastPet='';
      const id=flight.id; flight=null; finishAgentEncounter(id);
      const scene=sceneRef.current; if(scene) scene.style.visibility='hidden';
    };
    const screenPoint = { x: 0, y: 0, elevation: 0 };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const layer = layerRef.current;
      if (!layer) return;
      const photoFocus=photoTargetForRender();
      layer.setFocusActor(chatOpen.current?'pet':'me');
      layer.setProcessing('pet', photoFocus ? 'off' : processing.current);

      // Too slow for this device: hand back to the 2D map.
      slowFor = dt > 0.05 ? slowFor + dt : 0;
      if (slowFor > 4 && !selfieOpenRef.current && !visualQA) { onExit('slow'); return; }

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
          if (walkRef.current) stopWalk();
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
            setArrival({ id: w.questId, text: `You’re at ${w.title}` });
            if (w.questId !== requestedWalk.current?.id) onSelect(w.questId);

          }
        }
      }
      const meState = moving ? 'walk' : 'idle';
      if (meState !== lastMe) { layer.setState('me', meState); lastMe = meState; }
      layer.setPose('me', pos.current, heading.current, 0);
      if (moving && sourceRef.current === 'demo') stepRef.current(pos.current);

      // People walking to the same plan: each avatar glides to their latest step.
      const walking = walkersRef.current;
      const walkIds = new Set(walking.map((w) => `w:${w.id}`));
      for (const id of layer.actorIds()) {
        if (id.startsWith('w:') && !walkIds.has(id)) { layer.removeActor(id); walkerPos.current.delete(id); walkerState.delete(id); }
      }
      for (const w of walking) {
        const id = `w:${w.id}`;
        let cur = walkerPos.current.get(id);
        if (!cur) {
          layer.upsertActor(id, 'avatar', w.id);
          cur = { at: w.location, heading: bearingDeg(w.location, pos.current), moving: false };
          walkerPos.current.set(id, cur);
        }
        const gap = haversineMeters(cur.at, w.location);
        // Steps arrive every ~1.5 s: cover the gap at walking pace, snap if it is far behind.
        if (gap > 120) cur.at = w.location;
        else if (gap > 0.3) {
          const b = bearingDeg(cur.at, w.location);
          cur.at = moveMeters(cur.at, Math.min(gap, Math.max(gap * (1 - Math.exp(-dt * 1.6)), STICK_MPS * 0.6 * dt)), b);
          cur.heading = lerpDeg(cur.heading, b, 1 - Math.exp(-dt * 8));
        }
        cur.moving = gap > 1;
        const st = cur.moving ? 'walk' : 'idle';
        if (walkerState.get(id) !== st) { layer.setState(id, st); walkerState.set(id, st); }
        layer.setPose(id, cur.at, cur.heading, 0);
      }

      // The pet: walking beside you (a little behind your right shoulder), or in front of you
      // facing the camera while it talks. Further behind and he drops under the dashboard.
      const front = !photoFocus && petMode.current === 'front';
      // On a phone, outside the chat (the camera stays on you), his talking spot is pulled in so he
      // stays on screen beside you; the chat frames him itself, so it keeps the full staging.
      const narrowView=map.getContainer().clientWidth<600;
      const staged=museStage(front);
      const stage=front&&narrowView&&!chatOpen.current?{...staged,sideways:.5,towardViewer:.8,altitude:.45}:staged;
      const beside=moveMeters(pos.current,stage.sideways*scale,camBearing.current+90);
      const target=front?moveMeters(beside,stage.towardViewer*scale,camBearing.current+180):moveMeters(pos.current,.9*scale,heading.current+115);
      const gap = haversineMeters(petPos.current, target);
      const groundFollow = !front && !photoFocus && petState.current === 'hover';
      const kp = reducedMotion() ? 1 : 1 - Math.exp(-dt * (groundFollow ? 18 : 1.8));
      petPos.current = gap > 0.05 ? moveMeters(petPos.current, gap * kp, bearingDeg(petPos.current, target)) : target;
      const flying = gap > 2.5 * scale;
      // Beside you he is on the ground and walks when you do (floating is for flying over to you,
      // talking in front of you and thinking).
      const grounded = !front && !photoFocus && !flying && petState.current === 'hover';
      // He walks on the ground. He only floats while flying over to you and while he meets a friend's
      // Muse (an agent encounter); talking and thinking happen standing up.
      const floating = flying || (front && !!encounterRef.current);
      petAlt.current += ((floating ? (flying ? .8 : stage.altitude) : 0) - petAlt.current) * kp;
      const pState = flying ? 'fly' : grounded ? (moving ? 'walk' : 'stand') : petState.current;
      if (pState !== lastPet) { layer.setState('pet', pState); lastPet = pState; }
      // Standing beside you he fidgets now and then: a wave, a nod, a jump or a spin.
      if (pState === 'stand' && !reducedMotion()) {
        fidgetIn.current -= dt;
        if (fidgetIn.current <= 0) {
          fidgetIn.current = 24 + Math.random() * 12;
          const moves = ['wave', 'nod'];
          layer.setState('pet', moves[Math.floor(Math.random() * moves.length)]);
        }
      } else fidgetIn.current = Math.max(fidgetIn.current, 5);
      let petBearing=front ? normalizeDeg(camBearing.current + 180) : heading.current;
      if(photoFocus){layer.actorScreenPoint('pet',screenPoint);const b=cameraRects.current?.bounds;if(b)petBearing=photoFocusBearing({x:screenPoint.x+b.left,y:screenPoint.y+b.top},photoFocus.rect,camBearing.current);}
      // With the chat open Jolly flies up toward the screen: he grows until he almost fills the map
      // above the chat (the camera is already framing him). Back to size when it closes.
      const phoneView = (cameraRects.current?.bounds.width ?? window.innerWidth) < 768;
      // Size comes from the reserved conversation space, independent of reply-card height.
      const fit = phoneView ? Math.max(2.6, Math.min(3.6, chatAreaHeight.current / 65)) : 3.6;
      const boostTarget = chatOpen.current && !encounterRef.current && !photoFocus ? fit : 1;
      petBoost.current += (boostTarget - petBoost.current) * (reducedMotion() ? 1 : 1 - Math.exp(-dt * 1.2));
      layer.setBoost('pet', petBoost.current);
      // Once Jolly fills the view the avatar steps out, so the chat shows just his front.
      layer.setHidden('me', chatOpen.current && !encounterRef.current && petBoost.current > 1.8);
      layer.setPose('pet', petPos.current, petBearing, petAlt.current);
      // Keep the HTML thought anchor attached even when a manual gesture owns the camera.
      if(chatOpen.current&&thoughtsRef.current){
        layer.actorScreenPoint('pet',screenPoint);
        const bounds=cameraRects.current?.bounds;
        thoughtsRef.current.style.transform=`translate(${screenPoint.x.toFixed(1)}px, ${screenPoint.y.toFixed(1)}px)`;
        thoughtsRef.current.style.setProperty('--r',`${Math.round(Math.min((bounds?.width??window.innerWidth)*.28,125))}px`);
      }


      // One logical companion per user, in the same scene/frame loop. Origins are visual
      // staging points nearby, never a peer's private or inferred physical location.
      const request = encounterRef.current;
      if (!request && flight) clearFlight();
      if (request) {
        if (flight && flight.id !== request.id) clearFlight();
        if (!flight) {
          const peer=`muse:${request.recipient.id}`;
          const created=!layer.actorIds().includes(peer);
          layer.upsertActor(peer,'pet',request.recipient.id);
          layer.setMuseTrailStyle('pet','full'); layer.setMuseTrailStyle(peer,'full');
          flight={id:request.id,peer,created,motion:new EncounterMotion(),origin:{...petPos.current},altitude:petAlt.current,scale,bearing:camBearing.current,cursor:0,pulseAge:1,direction:null,deliver:-1,delivered:false};
        }
        const f=flight; f.pulseAge+=dt;
        const remaining=f.cursor<request.messages.length;
        // Hold the meeting so the reply bubble can be read before they part.
        const safeToReturn=!remaining && f.pulseAge>(reducedMotion()?.55:3.2);
        const done=f.motion.update(dt, request.outcome === 'error' || request.outcome === 'cancelled' || safeToReturn ? request.outcome : null, reducedMotion());
        const mix=f.motion.mix;
        const midpoint=moveMeters(f.origin,1.5*f.scale,f.bearing+70);
        const near=moveMeters(midpoint,.6*f.scale,f.bearing-90);
        const far=moveMeters(midpoint,.6*f.scale,f.bearing+90);
        const peerStart=moveMeters(f.origin,5*f.scale,f.bearing+80);
        const at=(a:LatLng,b:LatLng):LatLng=>({lat:a.lat+(b.lat-a.lat)*mix,lng:a.lng+(b.lng-a.lng)*mix});
        const own=at(f.origin,near);
        // Delivering: their Muse flies off with the envelope (toward its person, off to the side) and back.
        if(f.deliver>=0&&f.deliver<1){f.deliver=reducedMotion()?1:Math.min(1,f.deliver+dt/2.4);if(f.deliver>=1)f.delivered=true;}
        const out=f.deliver>=0&&f.deliver<1?Math.sin(f.deliver*Math.PI):0;
        const other=moveMeters(at(peerStart,far),7*f.scale*out,f.bearing+95);
        const altitude=f.altitude+f.motion.arc;
        layer.setPose('pet',own,bearingDeg(own,other),altitude);
        layer.setPose(f.peer,other,bearingDeg(other,own),altitude+.04);
        const meeting=f.motion.progress===1;
        const speaking=meeting&&f.pulseAge<.65;
        layer.setState('pet',meeting ? (speaking&&f.direction==='sent'?'talk':'hover'):'fly');
        layer.setState(f.peer,meeting ? (speaking&&f.direction==='received'?'talk':'hover'):'fly');
        if (meeting && request.outcome !== 'error' && request.outcome !== 'cancelled') {
          // The reply waits until their Muse is back from delivering the ask.
          const delivering=f.deliver>=0&&f.deliver<1;
          if (f.direction==='sent'&&f.deliver<0&&f.pulseAge>.7) f.deliver=0;
          if (remaining && f.pulseAge>.65 && !delivering && !(f.direction==='sent'&&!f.delivered)) {
            const received=request.messages[f.cursor++]==='received';
            f.direction=received?'received':'sent';
            layer.setState(received ? f.peer : 'pet','talk');
            layer.setState(received ? 'pet' : f.peer,'hover');
            layer.sendMusePulse(received ? f.peer : 'pet',received ? 'pet' : f.peer);
            f.pulseAge=0;
          }
        }
        // The scene overlay: both speech bubbles (the real envelope lines) and the envelope itself.
        const scene=sceneRef.current;
        if(scene){
          const a={x:0,y:0,elevation:0},b={x:0,y:0,elevation:0};
          const okA=layer.actorScreenPoint('pet',a),okB=layer.actorScreenPoint(f.peer,b);
          const notes=request.notes??[];const who=request.recipient.name.split(' ')[0];
          const sentLine=notes.find(n=>n.dir==='sent')?.text??`Is ${who} free?`;
          const replyLine=notes.find(n=>n.dir==='received')?.text??`${who}’s Muse replied`;
          const sentDone=request.messages.slice(0,f.cursor).includes('sent'),replyDone=request.messages.slice(0,f.cursor).includes('received');
          const deliveringNow=f.deliver>=0&&f.deliver<1;
          const ownText=!meeting?null:request.outcome&&replyDone&&f.pulseAge>1.4?(request.outcome==='success'?'Got it. Your answer is in the chat.':'No plan was confirmed.'):sentDone?sentLine:null;
          const peerText=!meeting?null:replyDone?replyLine:deliveringNow?`Taking this to ${who}…`:sentDone&&!f.delivered?`Got your note`:null;
          const put=(el:HTMLElement|null,ok:boolean,p:{x:number;y:number},text:string|null)=>{if(!el)return;if(!ok||!text){el.style.visibility='hidden';return;}if(el.dataset.text!==text){el.dataset.text=text;el.textContent=text;el.classList.remove('oh-enc-pop');void el.offsetWidth;el.classList.add('oh-enc-pop');}el.style.visibility='visible';const bw=el.offsetWidth,W=scene.clientWidth;const left=Math.min(Math.max(8,p.x-bw*(el.dataset.bubble==='own'?.88:.12)),Math.max(8,W-bw-8));const up=el.dataset.bubble==='peer'&&W<600?52:0;el.style.transform=`translate(${left.toFixed(1)}px,${(p.y-58-up).toFixed(1)}px) translateY(-100%)`;};
          put(scene.querySelector<HTMLElement>('[data-bubble=own]'),okA,a,ownText);
          put(scene.querySelector<HTMLElement>('[data-bubble=peer]'),okB,b,peerText);
          // The envelope: across with each message, and riding with their Muse while it delivers.
          const env=scene.querySelector<HTMLElement>('[data-envelope]');
          if(env){
            const flyT=f.pulseAge/.65,flying=meeting&&f.direction!==null&&flyT<1;
            let at2:{x:number;y:number}|null=null,lift=0;
            if(flying&&okA&&okB){const from=f.direction==='sent'?a:b,to=f.direction==='sent'?b:a;const t=flyT*flyT*(3-2*flyT);at2={x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t};lift=Math.sin(t*Math.PI)*50;}
            else if(deliveringNow&&okB){at2={x:b.x+16,y:b.y-6};}
            if(at2){env.style.visibility='visible';env.style.transform=`translate(${at2.x.toFixed(1)}px,${(at2.y-lift).toFixed(1)}px) translate(-50%,-50%) rotate(${(-8+16*Math.sin(now/180)).toFixed(1)}deg)`;}
            else env.style.visibility='hidden';
          }
          scene.style.visibility='visible';
        }
        if (done) { petPos.current={...f.origin}; petAlt.current=f.altitude; clearFlight(); }
      }

      // Friends near you become avatars (nearest few), the rest stay as map pins.
      if (now - lastNear > 1000) {
        lastNear = now;
        const walkingIds = new Set(walkersRef.current.map((w) => w.id));
        const near = friendsRef.current
          .filter((p) => !walkingIds.has(p.friend.id))
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
            if (!walkRef.current) setArrival({ id: q.id, text: `You’re at ${q.title}` });
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
      if (touring.current) return; // the HQ tour drives the camera
      if (chatOpen.current) {
        if(manualChatCamera.current){previousCamera=null;chatCamera=null;returnCamera=null;map.setCenterClampedToGround(true);camBearing.current=map.getBearing();return;}
        if (!chatCamera) {
          const c = map.getCenter();
          chatCamera = returnCamera ?? { center: [c.lng, c.lat], zoom, bearing: map.getBearing(), elevation: map.getCenterElevation(), pitch: map.getPitch() };
          returnCamera = null; restoringUntil = 0;
          entering.current = false;
          conversationCamera.current = true;
          previousCamera = null;
          map.stop(); map.setMaxZoom(24.2); map.setCenterClampedToGround(false);
        }
        camBearing.current = map.getBearing();
        const measured=cameraRects.current;if(!measured)return;
        const {bounds,visible}=measured;
        const area=museConversationArea(bounds,visible);
        const phone = bounds.width < 768;
        if(!area)return;
        // Reserve one composition for the conversation; only viewport/keyboard changes reframe it.
        const targetX = area.x, targetY = Math.max(area.y, bounds.height / 2 - 100);
        // The free space around that spot (nearest edge, doubled) is what Jolly's size has to fit in.
        chatAreaHeight.current = Math.max(80, 2 * Math.min(targetY - (area.y - area.height / 2), area.y + area.height / 2 - targetY));
        // A real encounter can widen the shot; ordinary request states retain the same framing.
        const targetZoom = encounterRef.current ? (phone ? 22.7 : 23.0) : phone ? 23.5 : 23.3;
        // A slow ease so you can watch the camera move in on Jolly (about 2 s to settle).
        const easing = reducedMotion() ? 1 : 1 - Math.exp(-dt * 1.5);
        const elevation = layer.actorCameraElevation('pet', boostTarget);
        const currentElevation = map.getCenterElevation();
        if (Math.abs(elevation - currentElevation) > .0005) {
          map.setCenterElevation(Math.abs(elevation - currentElevation) < .005 ? elevation : currentElevation + (elevation - currentElevation) * easing);
          previousCamera = null;
        }
        const cameraFocus=flight ? moveMeters(flight.origin,1.5*flight.scale,flight.bearing+70) : target;
        const nextZoom = Math.abs(targetZoom - zoom) < .001 ? targetZoom : zoom + (targetZoom - zoom) * easing;
        const pitch = Math.abs(map.getPitch() - 60) < .01 ? 60 : map.getPitch() + (60 - map.getPitch()) * easing;
        compose(cameraFocus.lng, cameraFocus.lat, nextZoom, map.getBearing(), targetX - bounds.width / 2, targetY - bounds.height / 2, pitch);
        return;
      }
      if(chatCamera){previousCamera=null;returnCamera=chatCamera;chatCamera=null;restoringUntil=now+(reducedMotion()?0:1900);}
      if(returnCamera){
        const target=returnCamera,c=map.getCenter(),k=reducedMotion()?1:1-Math.exp(-dt*3);
        map.setCenterElevation(map.getCenterElevation()+(target.elevation-map.getCenterElevation())*k);
        map.easeTo({center:[c.lng+(target.center[0]-c.lng)*k,c.lat+(target.center[1]-c.lat)*k],zoom:zoom+(target.zoom-zoom)*k,bearing:lerpDeg(map.getBearing(),target.bearing,k),pitch:map.getPitch()+(target.pitch-map.getPitch())*k,duration:0});
        if(reducedMotion()||now>=restoringUntil||Math.abs(map.getZoom()-target.zoom)<.005){
          map.jumpTo({center:target.center,zoom:target.zoom,bearing:target.bearing,pitch:target.pitch,elevation:target.elevation});map.setMaxZoom(MAX_3D_ZOOM);map.setCenterClampedToGround(true);returnCamera=null;restoringUntil=0;conversationCamera.current=false;
        }
        return; // Never overwrite a restored camera with the zoom sampled before restoration.
      }
      const busy = map.isZooming() || (!followRef.current && map.isMoving());
      if (followRef.current && !busy) {
        let z = zoom;
        if (entering.current) {
          z = reducedMotion() ? ENTER_ZOOM : zoom + (ENTER_ZOOM - zoom) * (1 - Math.exp(-dt * 2.2));
          if (Math.abs(ENTER_ZOOM - z) < 0.02) { z = ENTER_ZOOM; entering.current = false; }
        }
        camBearing.current = lerpDeg(camBearing.current, heading.current, 1 - Math.exp(-dt * 2.5));
        const h = map.getContainer().clientHeight;
        compose(pos.current.lng, pos.current.lat, z, camBearing.current, 0, Math.round(h * 0.2));
      } else if (!busy) {
        previousCamera = null;
        camBearing.current = map.getBearing();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); conversationCamera.current=false; clearFlight(); const previous = chatCamera ?? returnCamera; if (previous) { map.jumpTo({ center: previous.center, zoom: previous.zoom, bearing: previous.bearing, pitch: previous.pitch, elevation: previous.elevation }); map.setCenterClampedToGround(true); } };
  }, [map, gps.reading, onExit, onSelect, setFollow, setWalk, stopWalk, tryMove, viewer.id]);

  // ---- GPS source ----
  const chooseSource = async (next: Source) => {
    if (next === 'gps') await gps.requestCompass();
    sourceRef.current = next;
    setSourceState(next);
    stopWalk();
    if (next === 'demo') { streetHeadingSet.current = false; pos.current = home ?? DEMO_CENTER; moved.current = false; setFarKm(null); }
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
    onSelect(null);
  };
  useEffect(() => {
    if (!arrival) return;
    const t = window.setTimeout(() => setArrival(null), 5000);
    return () => window.clearTimeout(t);
  }, [arrival]);
  // Arriving at a plan you joined opens the selfie (#47), once per plan in this visit.
  // A snapshot, not a live lookup: saving the photo completes the plan, which drops it from the map.
  const [selfieQuest, setSelfieQuestState] = useState<Quest | null>(null);
  const setSelfieQuest = useCallback((q: Quest | null | ((cur: Quest | null) => Quest | null)) => {
    setSelfieQuestState((cur) => {
      const next = typeof q === 'function' ? q(cur) : q;
      if (next && !cur) minimizeChat(); // one panel at a time: the photo takes over from the chat
      selfieOpenRef.current = !!next;
      return next;
    });
  }, []);
  // A persona switch closes the other persona's photo.
  useEffect(() => { setSelfieQuestState(null); selfieOpenRef.current = false; }, [viewer.id]);
  const selfieShown = useRef(new Set<string>());
  /** The arrival pill: open the photo for a plan you joined. */
  const openSelfie = (id: string) => {
    const q = questsRef.current.find((x) => x.id === id && x.memberIds.includes(viewer.id));
    if (q) { selfieShown.current.add(q.id); setSelfieQuest(q); }
  };
  useEffect(() => {
    if (!arrival || selfieShown.current.has(arrival.id)) return;
    const q = questsRef.current.find((x) => x.id === arrival.id) ?? requestedWalk.current;
    if (q?.id !== arrival.id || !q.memberIds.includes(viewer.id)) return;
    selfieShown.current.add(q.id);
    setSelfieQuest(q);
  }, [setSelfieQuest, arrival, viewer.id]);
  // Tapping Jolly's picture in the Muse chat header makes him do the next move in his repertoire.
  useEffect(() => {
    const moves = ['wave', 'jump', 'spin', 'dance', 'cheer', 'nod'];
    const on = () => { if(reducedMotion()||processing.current==='pending'||photoTargetForRender())return;layerRef.current?.setState('pet', moves[trickAt.current++ % moves.length]); };
    window.addEventListener('muse:trick', on);
    return () => window.removeEventListener('muse:trick', on);
  }, []);
  // "Take a photo together" on the Up next card reopens this dialog (one photo prompt).
  useEffect(() => {
    const on = (e: Event) => {
      const q = questsRef.current.find((x) => x.id === (e as CustomEvent<string>).detail);
      if (!q?.memberIds.includes(viewer.id)) return;
      e.preventDefault();
      selfieShown.current.add(q.id);
      setSelfieQuest(q);
    };
    window.addEventListener(OPEN_SELFIE, on);
    return () => window.removeEventListener(OPEN_SELFIE, on);
  }, [setSelfieQuest, viewer.id]);
  // Closed while early: the selfie comes back when the plan starts, if you're still there.
  const selfieWaiting = useRef<Quest | null>(null);
  const closeSelfie = useCallback(() => {
    setSelfieQuest((q) => {
      selfieWaiting.current = q && new Date(q.startsAt).getTime() > Date.now() ? q : null;
      return null;
    });
  }, [setSelfieQuest]);
  useEffect(() => {
    const t = window.setInterval(() => {
      const q = selfieWaiting.current;
      if (!q || new Date(q.startsAt).getTime() > Date.now()) return;
      selfieWaiting.current = null;
      if (haversineMeters(pos.current, q.location) <= ARRIVE_METERS * 3) setSelfieQuest(q);
    }, 5000);
    return () => window.clearInterval(t);
  }, [setSelfieQuest]);

  useEffect(() => {
    if (arrival && !arrival.id.startsWith('f:')) onArrive?.(arrival.id);
  }, [arrival, onArrive]);

  useEffect(() => {
    if (!walkTo) {
      if (requestedWalk.current && walkRef.current?.questId === requestedWalk.current.id) setWalk(null);
      requestedWalk.current = null;
      return;
    }
    if (requestedWalk.current?.id === walkTo.id) return;
    requestedWalk.current = walkTo;
    setArrival(null);
    arrived.current.delete(walkTo.id);
    sourceRef.current = 'demo';
    setSourceState('demo');
    setWalk({ questId: walkTo.id, title: walkTo.title, emoji: walkTo.emoji, to: walkTo.location });
    setFollow(true);
  }, [walkTo, setFollow, setWalk]);

  // ---- Tap a friend: the chat sheet, their replies over their head, walking to them ----
  const [chat, setChat] = useState<{ id: string; incoming: boolean } | null>(null);
  const [said, setSaid] = useState<Record<string, string>>({});
  const saidTimers = useRef(new Map<string, number>());
  const onReply = useCallback((id: string, text: string) => {
    setSaid((m) => ({ ...m, [id]: text }));
    window.clearTimeout(saidTimers.current.get(id));
    saidTimers.current.set(id, window.setTimeout(() => setSaid((m) => { const n = { ...m }; delete n[id]; return n; }), 25_000));
  }, []);
  useEffect(() => () => { for (const t of saidTimers.current.values()) window.clearTimeout(t); }, []);
  const openChat = useCallback((id: string) => {
    layerRef.current?.setState('me', 'wave');
    layerRef.current?.setState(`f:${id}`, 'wave');
    setChat({ id, incoming: false });
  }, []);
  // A friend's message coming in opens the same sheet on this side, with replies.
  const threads = useApi<{ threads: ThreadView[] }>('/api/threads', [`user:${viewer.id}`]);
  const seenMsg = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const list = threads.data?.threads;
    if (!list) return;
    const fresh = list
      .filter((t) => !t.isGroup && t.lastMessage && t.lastMessage.fromId !== viewer.id && t.unreadCount > 0 && Date.now() - Date.parse(t.lastMessage.createdAt) < 3 * 60_000)
      .sort((a, b) => Date.parse(b.lastMessage!.createdAt) - Date.parse(a.lastMessage!.createdAt))[0];
    const id = fresh?.lastMessage?.id ?? null;
    if (seenMsg.current === undefined) { seenMsg.current = id; return; } // not on first load
    if (!fresh || id === seenMsg.current) return;
    seenMsg.current = id;
    const from = fresh.lastMessage!.fromId;
    onReply(from, fresh.lastMessage!.text);
    setChat((c) => (c?.id === from ? c : { id: from, incoming: true }));
  }, [threads.data, viewer.id, onReply]);
  const chatFriend: ChatFriend | null = useMemo(() => {
    if (!chat) return null;
    const p = friendPins.find((x) => x.friend.id === chat.id);
    const person = p?.friend ?? threads.data?.threads.flatMap((t) => t.members).find((m) => m.id === chat.id);
    if (!person) return null;
    const b = p?.bubble;
    return {
      id: person.id, name: person.name, handle: 'handle' in person ? (person.handle as string) : undefined, avatarUrl: person.avatarUrl,
      place: p ? `${b?.emoji ? `${b.emoji} ` : ''}${p.placeLabel ?? b?.doing ?? 'Nearby'}` : null,
      walkMin: p ? minutesLeft(pos.current, p.location) : null,
      thought: b?.thought ?? null, emoji: b?.emoji ?? null, wantsTo: b?.wantsTo ?? null,
      free: !!p?.availability || !!b?.thought,
    };
  }, [chat, friendPins, threads.data]);
  const walkToFriend = useMemo(() => {
    const p = chat ? friendPins.find((x) => x.friend.id === chat.id) : null;
    if (!p) return null;
    return () => {
      setArrival(null);
      arrived.current.delete(`f:${p.friend.id}`);
      sourceRef.current = 'demo';
      setSourceState('demo');
      setWalk({ questId: `f:${p.friend.id}`, title: firstName(p.friend.name), emoji: '👋', to: p.location });
      setFollow(true);
    };
  }, [chat, friendPins, setWalk, setFollow]);

  const bindLabel = useCallback((id: string, lift?: number) => (el: HTMLElement | null) => {
    layerRef.current?.bindLabel(id, el, lift);
  }, []);

  // "Back to you" from the map's control stack.
  useEffect(() => {
    const on = () => { stopTour(); entering.current = true; setFollow(true); };
    window.addEventListener('outhere:recenter', on);
    return () => window.removeEventListener('outhere:recenter', on);
  }, [stopTour, setFollow]);
  // The walking capsule measures progress from where the walk started.
  const walkStart = useRef<{ id: string; meters: number } | null>(null);
  if (walk && walkStart.current?.id !== walk.questId) {
    walkStart.current = { id: walk.questId, meters: Math.max(1, haversineMeters(pos.current, walk.to)) };
  }
  if (!walk) walkStart.current = null;
  const progressOf = (at: LatLng) => {
    if (!walk || !walkStart.current) return 0;
    return Math.min(1, Math.max(0, 1 - haversineMeters(at, walk.to) / walkStart.current.meters));
  };

  const gpsLine = source !== 'gps' ? null
    : gps.status === 'asking' ? 'Finding you…'
      : gps.status === 'weak' ? 'GPS signal is weak here'
        : gps.status === 'on' ? `Live GPS · ±${Math.round(gps.reading.current.fix?.accuracy ?? 0)} m`
          : null;

  return (
    <div
      data-testid="world-3d"
      // While the Muse chat is open the friends' photos and plan labels step aside, so Jolly is in front.
      data-muse-chat={companion.open ? 'true' : undefined}
      data-scene-ready={layerRef.current ? 'true' : 'false'}
      data-agent-peers={layerRef.current?.actorIds().filter(id => id.startsWith('muse:')).length ?? 0}
      data-follow={follow ? 'true' : 'false'}
      data-source={source}
      data-zoom={map.getZoom().toFixed(1)}
      data-pitch={Math.round(map.getPitch())}
      data-lat={pos.current.lat.toFixed(5)}
      data-lng={pos.current.lng.toFixed(5)}
      className="pointer-events-none absolute inset-0 z-[5]"
    >
      {/* No loading screen: the map's own zoom into 3D (and back out) is the transition. */}
      {/* Muse's thought orbs and bubbles around Jolly (only while the chat is open). */}
      <MuseThoughts anchorRef={thoughtsRef} />
      {/* Muse to Muse: what each envelope says, over each Muse, and the envelope going between them. */}
      <div ref={sceneRef} aria-hidden data-testid="muse-encounter-scene" className="pointer-events-none absolute inset-0 z-[7] overflow-hidden" style={{ visibility: 'hidden' }}>
        <span data-bubble="own" data-testid="encounter-bubble-own" className="oh-enc-bubble" style={{ visibility: 'hidden' }} />
        <span data-bubble="peer" data-testid="encounter-bubble-peer" className="oh-enc-bubble oh-enc-bubble-peer" style={{ visibility: 'hidden' }} />
        <span data-envelope data-testid="encounter-envelope" className="oh-enc-envelope" style={{ visibility: 'hidden' }}>✉️</span>
      </div>
      {/* Walking: one capsule at the top. The plan, everyone's progress along the way, minutes left. */}
      {walk && walkMin != null && (
        <div role="status" data-testid="walk-countdown"
          className="pointer-events-auto absolute left-1/2 top-3 z-20 flex w-[min(calc(100%-24px),460px)] -translate-x-1/2 animate-drop-in items-center gap-3 rounded-full bg-fb-surface/95 p-1.5 shadow-popover backdrop-blur">
          <CategoryIcon category={categoryOf(walk.questId, walk.emoji)} size={40} />
          <span className="sr-only">{walkMin <= 1 ? 'Almost there' : `${walkMin} min`} to {walk.title}</span>
          <div className="relative mx-2 h-2 min-w-0 flex-1 rounded-full bg-[#E4E6EB]" aria-hidden>
            <div className="absolute inset-y-0 left-0 rounded-full bg-fb-blue transition-[width] duration-700" style={{ width: `${progressOf(pos.current) * 100}%` }} />
            {together.plan?.id === walk.questId && together.walkers.map((w) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={w.id} src={w.avatarUrl} alt="" title={firstName(w.name)}
                className="absolute top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 rounded-full object-cover ring-2 ring-white transition-[left] duration-700"
                style={{ left: `${progressOf(walkerPos.current.get(`w:${w.id}`)?.at ?? w.location) * 100}%` }} />
            ))}
            {viewer.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={viewer.avatarUrl} alt="" className="absolute top-1/2 z-[1] size-8 -translate-x-1/2 -translate-y-1/2 rounded-full object-cover ring-2 ring-fb-blue transition-[left] duration-700"
                style={{ left: `${progressOf(pos.current) * 100}%` }} />
            ) : (
              <span className="absolute top-1/2 z-[1] size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fb-blue ring-2 ring-white" style={{ left: `${progressOf(pos.current) * 100}%` }} />
            )}
          </div>
          {together.plan?.id === walk.questId && together.walkers.length > 0 && (
            <span data-testid="walk-with" className="sr-only">with {together.walkers.map((w) => firstName(w.name)).join(' and ')}</span>
          )}
          <span className="shrink-0 text-[18px] font-bold tabular-nums text-fb-text">{walkMin <= 1 ? '<1m' : `${walkMin}m`}</span>
          <button type="button" onClick={stopWalk} aria-label="Stop walking" title="Stop"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fb-secondary-btn text-[18px] font-semibold text-fb-text hover:brightness-95">
            <X size={18} aria-hidden />
          </button>
        </div>
      )}
      {/* You made it: the together moment (who's here, group selfie, Muse caption, how was it). */}
      <TogetherMoment
        quest={selfieQuest}
        viewer={viewer}
        walkers={together.plan?.id === selfieQuest?.id ? together.walkers : []}
        onClose={closeSelfie}
      />
      {chatFriend && !selfieQuest && (
        <FriendChat friend={chatFriend} viewerId={viewer.id} incoming={chat?.incoming ?? false} onReply={onReply}
          onWalk={walkToFriend} walking={walk?.questId === `f:${chatFriend.id}`} onClose={() => setChat(null)} />
      )}
      {/* The blue home dot is replaced by the avatar while the 3D view is open. */}
      <style>{'[data-view3d] [data-map-marker="me"]{transition:opacity .18s}[data-view3d][data-world-characters="true"] [data-map-marker="me"],[data-view3d][data-world-characters="true"] [data-testid="my-pin"]{opacity:0;pointer-events:none}@media(prefers-reduced-motion:reduce){[data-view3d] [data-map-marker="me"]{transition:none}}'}</style>

      {/* Labels the world layer keeps above heads: the pet's speech, friends' names and status. */}
      <div inert={companion.open} className="absolute inset-0 overflow-hidden">
        {bubble ? (
          <div ref={bindLabel('pet', 0.15)} data-testid="pet-bubble" data-muse-world-bubble role="status" aria-live="polite" aria-atomic="true" style={{ visibility: 'hidden' }} className="absolute left-0 top-0 pb-2">
            <button
              type="button"
              aria-label={planOpen ? undefined : `Muse says: ${bubble.text}. Open Muse chat`}
              onClick={planOpen ? undefined : () => openMuseChat()}
              className="pointer-events-auto relative block max-w-[260px] rounded-[18px] bg-fb-surface px-3 py-2 text-left text-[14px] leading-[18px] text-fb-text shadow-popover"
            >
              {bubble.tone === 'muse' && <span className="mb-0.5 flex items-center gap-1 text-[12px] font-bold text-fb-blue"><Sparkles size={12} aria-hidden />Muse</span>}
              <span>{bubble.text}</span>{bubble.pending&&<span aria-hidden className="ml-1 tracking-widest text-fb-blue">···</span>}
              <span aria-hidden className="absolute -bottom-[6px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-fb-surface" />
            </button>
          </div>
        ) : !companion.open && (
          // Tap Jolly: an invisible target over the pet opens the chat (the 3D pet itself is not pickable).
          <div ref={bindLabel('pet', 0.15)} data-testid="pet-tap" style={{ visibility: 'hidden' }} className="absolute left-0 top-0 pb-1">
            <button
              type="button"
              aria-label="Talk to Muse"
              onClick={() => openMuseChat()}
              // Invisible: tapping Jolly himself opens the chat. The one visible Muse button is the
              // hovering Jolly at the side (MuseChat), the same in every view.
              className="pointer-events-auto block size-16 translate-y-10 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-fb-blue"
            />
          </div>
        )}
        {together.walkers.map((w) => (
          <div key={w.id} ref={bindLabel(`w:${w.id}`, 0.2)} data-world-label style={{ visibility: 'hidden' }} className="absolute left-0 top-0">
            <span data-testid="world-walker" className="flex items-center gap-1 whitespace-nowrap rounded-pill bg-fb-blue px-2.5 py-1 text-[13px] font-semibold text-white shadow-card">
              <Footprints size={14} aria-hidden />{firstName(w.name)} · {w.minutesAway <= 1 ? 'almost there' : `${w.minutesAway} min away`}
            </span>

          </div>
        ))}
        {nearFriends.map((f) => (
          <div key={f.id} ref={bindLabel(`f:${f.id}`, 0.2)} data-world-label style={{ visibility: 'hidden' }} className="absolute left-0 top-0">
            <button
              type="button"
              data-testid="world-friend"
              aria-label={`${f.label}: tap to message`}
              onClick={() => openChat(f.id)}
              className={cn('pointer-events-auto relative whitespace-nowrap rounded-pill px-2.5 py-1 text-[13px] font-semibold shadow-card transition-all',
                said[f.id] ? 'animate-pop-in bg-fb-surface px-3.5 py-1.5 text-[15px] text-fb-text' : chat?.id === f.id ? 'bg-fb-surface text-fb-text ring-[3px] ring-fb-blue' : 'bg-fb-surface/95 text-fb-text hover:bg-fb-hover')}
            >
              {said[f.id] ? <span data-testid="world-friend-said">{clip(said[f.id]!, 34)}</span> : f.label}
              {said[f.id] && <span aria-hidden className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 bg-fb-surface" />}
            </button>
          </div>
        ))}
      </div>

      {/* Building names at Meta HQ: only on the campus tour (they crowd the plan cards otherwise). */}
      {tour && (
        <div inert={companion.open} className="absolute inset-0 overflow-hidden">
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

        {arrival && !walk && !selfieQuest && (
          <button type="button" data-testid="arrival" onClick={() => openSelfie(arrival.id)}
            className="pointer-events-auto flex items-center gap-1.5 rounded-pill bg-[#24A148] px-3 py-1.5 text-[14px] font-semibold text-white shadow-popover hover:brightness-95">
            <MapPin size={16} aria-hidden />{arrival.text}
          </button>
        )}
        <ArrivalSelfie key={viewer.id} quest={selfieQuest} onClose={closeSelfie} />

        {canWalk && selected && !walk && (
          // Phones: an open plan card covers this spot, and its own Let's go does the same.
          <button type="button" data-testid="walk-there" onClick={startWalk} className={cn('pointer-events-auto inline-flex h-10 items-center gap-1.5 rounded-pill bg-fb-blue px-4 text-[15px] font-semibold text-white shadow-popover hover:bg-fb-blue-hover', selectedId && 'max-md:hidden')}>
            <Footprints size={18} aria-hidden />Walk there · {selectedMin} min
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
      <div className="absolute bottom-10 right-3 flex flex-col items-end gap-2 max-md:bottom-[156px]">
        {tools && hqLabels.length > 0 && !tour && (
          <button type="button" data-testid="hq-tour" onClick={() => void startTour()} className="pointer-events-auto h-10 rounded-pill bg-fb-surface px-3 text-[14px] font-semibold text-fb-text shadow-popover hover:bg-fb-hover">
            Tour Meta HQ
          </button>
        )}
        {tools && !follow && (
          <button type="button" data-testid="back-to-me" onClick={() => { stopTour(); entering.current = true; setFollow(true); }} className="pointer-events-auto inline-flex h-10 items-center gap-1.5 rounded-pill bg-fb-surface px-3 text-[14px] font-semibold text-fb-text shadow-popover hover:bg-fb-hover">
            <LocateFixed size={16} aria-hidden />Back to me
          </button>
        )}
        {(tools || source === 'gps') && <div role="group" aria-label="Where you are" className="pointer-events-auto flex gap-1 rounded-pill bg-fb-surface p-1 shadow-card">
          {(['demo', 'gps'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={source === s}
              data-testid={`location-${s}`}
              onClick={() => void chooseSource(s)}
              className={cn('h-8 rounded-pill px-3 text-[13px] font-semibold', source === s ? 'bg-fb-blue-tint text-fb-blue' : 'text-fb-text-2 hover:bg-fb-hover')}
            >
              {s === 'demo' ? 'Demo walk' : 'Live GPS'}
            </button>
          ))}
        </div>}
        {gpsLine && <p className="rounded-pill bg-fb-surface px-2.5 py-1 text-[12px] text-fb-text-2 shadow-card">{gpsLine} · stays on this device</p>}
      </div>

      {/* Bottom left, above the view toggle: the joystick (demo walk only). */}
      {/* The joystick is a rehearsal tool: Let's go walks you there on its own. */}
      {source === 'demo' && tools && <Joystick stick={stick} />}
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
    <div className="absolute bottom-[88px] left-3 max-md:bottom-[156px]">
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
