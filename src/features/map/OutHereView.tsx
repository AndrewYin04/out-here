'use client';
// The Out Here tab: full-height map with the Explore / Friends toggle, quest pins with live seat
// badges, the quest sheet, and the Find My and "I'm free" layers from the other Out Here areas.
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { CalendarCheck } from 'lucide-react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApi, useQuests, useViewer } from '@/features/data';
import { FriendsLayer, PeopleButton, useFriendPins } from '@/features/map/friends';
import { BothFreeNudge, ImFreeButton, MuseLabel, PlanSheet, TogetherSheet, UpNextCard, listenLetsGo, setPlanOpen, useMuseFilter, usePlanAsk, usePlanOpen, usePlanSuggestions, useTogetherId, useUpNext } from '@/features/outhere';
import { Plus } from 'lucide-react';
import { Button, cn, EmptyState, useDemoTools, useToast } from '@/features/ui';
import { DEMO_CENTER, DEMO_QUESTS, seedId, type LatLng, type Quest } from '@/shared';
import { FallbackList } from './FallbackList';
import { MapAttribution } from './MapAttribution';
import { CreatePlanSheet } from './create/CreatePlanSheet';
import { QuestPanel } from './QuestPanel';
import type { FriendFace, MapContext, MapMode } from './types';
import { initialView, shouldEnter3d, type MapView } from './view3d';

const MapCanvas = dynamic(() => import('./MapCanvas'), { ssr: false });
// The 3D street view (world area). Loaded only when someone opens it, so three.js and the
// models stay out of the map's first load.
const World3D = dynamic(() => import('@/features/world').then((m) => m.World3D), { ssr: false });

// Remembered per tab, so a fresh visit always lands on the 3D view (#13) and moving around the
// app and back keeps whichever view this tab was on.
const VIEW_KEY = 'outhere.view';
function readSavedView(): string | null {
  try { return window.sessionStorage.getItem(VIEW_KEY); } catch { return null; }
}
function saveView(v: MapView) {
  try { window.sessionStorage.setItem(VIEW_KEY, v); } catch { /* private mode: not remembered */ }
}

/** Seeded quests get a readable test id ("quest-pin-dumplings"); others use their id. */
const KEY_BY_ID = new Map(DEMO_QUESTS.map((q) => [seedId('quest', q.key), q.key]));
const testIdFor = (id: string) => `quest-pin-${KEY_BY_ID.get(id) ?? id}`;

function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

function setQuestParam(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('quest', id);
  else url.searchParams.delete('quest');
  window.history.replaceState(window.history.state, '', url.toString());
}

export function OutHereView() {
  const { viewer: persona } = useViewer();
  const now = useNow();
  const questsApi = useQuests(DEMO_CENTER, 5000);
  const ctxApi = useApi<MapContext>('/out-here/context', [], (d) => Object.keys(d.walkMinutes).map((id) => `quest:${id}`));
  const [mode, setMode] = useState<MapMode>('explore');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [view, setViewState] = useState<MapView>('map');
  const [viewNote, setViewNote] = useState<string | null>(null);
  const [walkTo, setWalkTo] = useState<{ questId: string } | null>(null);
  const setView = useCallback((v: MapView) => {
    if (v === 'map') setWalkTo(null);
    setViewState(v);
    saveView(v);
  }, []);
  // "Post a plan": the draft pin's spot and emoji while the create sheet is open.
  const [creating, setCreating] = useState<{ at: LatLng; emoji: string } | null>(null);
  const planOpen = usePlanOpen();
  const toast = useToast();
  const tools = useDemoTools();

  // ?quest=<id> deep link opens that quest's sheet; ?mode=friends|explore sets the toggle.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('quest');
    if (id) setSelectedId(id);
    const m = params.get('mode');
    if (m === 'friends' || m === 'explore') setMode(m);
    // ?view=3d|map opens that view (the demo link); otherwise this tab's last one, else 3D.
    setViewState(initialView(params.get('view'), readSavedView(), navigator.webdriver === true));
  }, []);

  // The Muse plan on screen: its picked pins stand out, and the map frames them with the viewer
  // and the top suggestion's friends (only friends whose Find My pin is on the map).
  const planPicks = usePlanSuggestions();
  const friendPins = useFriendPins();

  const ctx = ctxApi.data && ctxApi.data.viewer.id === persona.id ? ctxApi.data : null;
  const live = useMemo(() => (questsApi.data?.quests ?? []).filter((q) => q.status !== 'done' && new Date(q.endsAt) > now), [questsApi.data, now]);
  const visible: Quest[] = useMemo(() => {
    if (mode === 'explore') return live;
    const friends = new Set(ctx?.friendIds ?? []);
    return live.filter((q) => q.memberIds.some((m) => friends.has(m)));
  }, [mode, live, ctx]);

  // Muse filter: in Explore only the plans Muse kept show (plus the viewer's own and the open
  // one); in Friends only the friends it kept. Off, or before Muse answers, everything shows.
  const ask = usePlanAsk();
  const filter = useMuseFilter(mode, ask);
  const shown: Quest[] = useMemo(() => {
    if (mode !== 'explore' || !filter.keep) return visible;
    const keep = filter.keep;
    return visible.filter((q) => keep.has(q.id) || q.memberIds.includes(persona.id) || q.id === selectedId);
  }, [mode, visible, filter.keep, persona.id, selectedId]);
  const friendKeep = mode === 'friends' ? filter.keep : null;
  const allFriendPins = useMemo(() => friendPins.data?.pins ?? [], [friendPins.data]);
  const shownFriends = friendKeep ? allFriendPins.filter((p) => friendKeep.has(p.friend.id)).length : allFriendPins.length;
  const shownCount = mode === 'explore' ? shown.length : shownFriends;
  // The label on each kept item's reason: "✨ Muse" for a live model pick, otherwise what answered.
  const reasonLabel = filter.closest ? 'Closest' : filter.source === 'fallback' ? 'Quick match' : filter.live ? '✨ Muse' : 'Muse (offline)';
  const reasonFor = useCallback((id: string) => {
    const text = filter.on ? filter.reasons.get(id) : undefined;
    return text ? { label: reasonLabel, text } : null;
  }, [filter.on, filter.reasons, reasonLabel]);
  const [whyOpen, setWhyOpen] = useState(false);
  useEffect(() => { if (!filter.on) setWhyOpen(false); }, [filter.on]);
  const keptItems = useMemo(() => {
    if (!filter.keep) return [];
    if (mode === 'explore') {
      const byId = new Map(visible.map((q) => [q.id, q]));
      return [...filter.reasons].flatMap(([id, reason]) => {
        const q = byId.get(id);
        return q ? [{ id, icon: q.emoji, name: q.title, reason }] : [];
      });
    }
    const byId = new Map(allFriendPins.map((p) => [p.friend.id, p]));
    return [...filter.reasons].flatMap(([id, reason]) => {
      const p = byId.get(id);
      return p ? [{ id, icon: p.bubble.emoji ?? '', name: p.friend.name, reason }] : [];
    });
  }, [filter.keep, filter.reasons, mode, visible, allFriendPins]);

  // Muse filter answers: frame the kept pins and the viewer, clear of the top chips and the
  // I'm free button. Turning the filter off puts the camera back where it was.
  const savedCamera = useRef<{ center: [number, number]; zoom: number; bearing: number; pitch: number } | null>(null);
  const keepKey = filter.keep ? `${mode}:${[...filter.keep].sort().join(',')}` : '';
  const hasOrigin = !!ctx?.origin;
  const friendPinsReady = allFriendPins.length > 0;
  useEffect(() => {
    // The 3D street view keeps its own camera (behind the avatar); only the 2D map reframes.
    if (!map || map.getContainer().hasAttribute('data-view3d')) return;
    if (!filter.on) {
      const cam = savedCamera.current;
      savedCamera.current = null;
      if (cam) map.easeTo({ ...cam, duration: 500 });
      return;
    }
    if (!filter.keep || filter.keep.size === 0) return;
    const keep = filter.keep;
    const pts: LatLng[] = mode === 'explore'
      ? shown.filter((q) => keep.has(q.id)).map((q) => q.location)
      : allFriendPins.filter((p) => keep.has(p.friend.id)).map((p) => p.location);
    if (pts.length === 0) return;
    if (ctx?.origin) pts.push(ctx.origin);
    if (!savedCamera.current) {
      const c = map.getCenter();
      savedCamera.current = { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
    }
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const desktop = window.matchMedia('(min-width: 768px)').matches;
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], {
      padding: desktop ? { top: 130, bottom: 110, left: 90, right: 90 } : { top: 120, bottom: 170, left: 44, right: 44 },
      maxZoom: desktop ? 16 : 15.5,
      duration: 600,
    });
    // shown, the friend pins and the origin are read when an answer arrives; keepKey triggers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, filter.on, keepKey, hasOrigin, friendPinsReady]);
  // Friends mode: the faces of friends who joined each plan, shown on its pin.
  const friendFaces = useMemo(() => {
    if (mode !== 'friends' || !ctx) return null;
    const byId = new Map(ctx.friends.map((f) => [f.id, f]));
    const out: Record<string, FriendFace[]> = {};
    for (const q of visible) out[q.id] = q.memberIds.flatMap((m) => byId.get(m) ?? []);
    return out;
  }, [mode, ctx, visible]);

  const picks = useMemo(() => {
    if (!planPicks) return null;
    const onMap = new Set(shown.map((q) => q.id));
    const ids = planPicks.questIds.filter((id) => onMap.has(id));
    return ids.length > 0 ? ids : null;
  }, [planPicks, shown]);
  const fitTo = useMemo<LatLng[] | null>(() => {
    if (!planPicks || mode !== 'friends') return null;
    const want = new Set(planPicks.topFriendIds);
    const pts = (friendPins.data?.pins ?? []).filter((p) => want.has(p.friend.id)).map((p) => p.location);
    return pts.length > 0 ? pts : null;
  }, [planPicks, mode, friendPins.data]);

  const select = useCallback((id: string | null) => { setSelectedId(id); setQuestParam(id); }, []);
  const togetherId = useTogetherId();
  const sheetOpen = planOpen || togetherId !== null;
  // "See it on the map" from a confirmed shared plan opens that quest's panel here.
  useEffect(() => {
    const on = (e: Event) => select((e as CustomEvent<string>).detail);
    window.addEventListener('outhere:select-quest', on);
    return () => window.removeEventListener('outhere:select-quest', on);
  }, [select]);

  // Long-press / right-click on the map, or the ＋ button (map centre): start a new plan there.
  const startCreate = useCallback((at?: LatLng) => {
    const c = map?.getCenter();
    const spot = at ?? (c ? { lat: c.lat, lng: c.lng } : DEMO_CENTER);
    setPlanOpen(false);
    select(null);
    setCreating((cur) => ({ at: spot, emoji: cur?.emoji ?? '📍' }));
  }, [map, select]);
  const moveDraft = useCallback((at: LatLng) => setCreating((cur) => (cur ? { ...cur, at } : cur)), []);
  const draftEmoji = useCallback((emoji: string) => setCreating((cur) => (cur && cur.emoji !== emoji ? { ...cur, emoji } : cur)), []);
  const onPosted = useCallback((q: Quest) => {
    setCreating(null);
    setMode('explore');
    void questsApi.refetch();
    select(q.id);
    toast.show('Your plan is live on the map.');
  }, [questsApi, select, toast]);
  const onUnsupported = useCallback(() => setUnsupported(true), []);
  // While a plan is being created, tapping other pins does nothing (the create sheet owns the panel).
  const noSelect = useCallback(() => {}, []);
  const refetchAll = useCallback(() => { void questsApi.refetch(); void ctxApi.refetch(); }, [questsApi, ctxApi]);
  // A friend tapped in the 3D view opens their Find My card (it lives in Friends mode).
  const openFriend = useCallback((id: string) => {
    setMode('friends');
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('findmy:open', { detail: { id } })), 60);
  }, []);
  const exit3d = useCallback(() => {
    setView('map');
    setViewNote('3D was running slowly on this device, so you’re back on the map.');
  }, [setView]);
  // One zoom, two views: pinching 3D out to the city hands over to the 2D map, and pinching the
  // 2D map back in near you steps into 3D behind your avatar.
  const zoomOut3d = useCallback(() => setView('map'), [setView]);
  const meRef = useRef<LatLng>(DEMO_CENTER);
  meRef.current = ctx?.origin ?? DEMO_CENTER;
  const busyRef = useRef(false);
  busyRef.current = !!creating;
  useEffect(() => {
    if (!map || view !== 'map' || unsupported) return;
    let hand = false;
    const start = (e: { originalEvent?: unknown }) => { if (e.originalEvent) hand = true; };
    const end = () => {
      const wasHand = hand;
      hand = false;
      if (!wasHand || busyRef.current || map.getContainer().hasAttribute('data-view3d')) return;
      const c = map.getCenter();
      if (shouldEnter3d(map.getZoom(), { lat: c.lat, lng: c.lng }, meRef.current)) setView('3d');
    };
    map.on('zoomstart', start);
    map.on('zoomend', end);
    return () => { map.off('zoomstart', start); map.off('zoomend', end); };
  }, [map, view, unsupported, setView]);
  useEffect(() => {
    if (!viewNote) return;
    const t = window.setTimeout(() => setViewNote(null), 6000);
    return () => window.clearTimeout(t);
  }, [viewNote]);
  const show3d = view === '3d' && !unsupported && !!map;

  // Keep the next plan reachable even when its pin is filtered out of the map.
  const upNext = useUpNext();
  const nextQuest = upNext?.quest;
  // Let's go can come from any plan you joined (a plan's panel, an accepted invite), not only Up next.
  const walkQuest = !walkTo ? null
    : nextQuest?.id === walkTo.questId ? nextQuest
      : (questsApi.data?.quests ?? []).find((q) => q.id === walkTo.questId) ?? null;
  const [arrivedId, setArrivedId] = useState<string | null>(null);
  const letsGo = useCallback((questId: string) => {
    if (unsupported) { select(questId); return; }
    select(null);
    setArrivedId(null);
    setView('3d');
    setWalkTo({ questId });
  }, [select, setView, unsupported]);
  const finishWalk = useCallback((questId: string) => {
    setWalkTo((current) => current?.questId === questId ? null : current);
  }, []);
  // Every "Let's go" in the app (accepted invite, "Maya's in", a joined plan's panel) lands here;
  // from another page it arrives as ?go=<questId>.
  useEffect(() => listenLetsGo(letsGo), [letsGo]);
  const goParam = useRef(false);
  useEffect(() => {
    if (goParam.current) return;
    goParam.current = true;
    const url = new URL(window.location.href);
    const id = url.searchParams.get('go');
    if (!id) return;
    url.searchParams.delete('go');
    window.history.replaceState(window.history.state, '', url.toString());
    setMode('explore');
    letsGo(id);
  }, [letsGo]);
  const onArrive = useCallback((questId: string) => {
    finishWalk(questId);
    setArrivedId(questId);
  }, [finishWalk]);

  return (
    <div className="relative h-[calc(100dvh-112px)] overflow-hidden bg-[#EEF0F2] md:h-[calc(100dvh-56px)]" data-testid="out-here-map" data-mode={mode} data-view={show3d ? '3d' : 'map'} data-walk-to={walkQuest?.id ?? undefined} data-arrived={arrivedId ?? undefined}>
      <h1 className="sr-only">Out Here map, Menlo Park</h1>
      {unsupported ? (
        <FallbackList quests={shown} walkMinutes={ctx?.walkMinutes ?? {}} now={now} onSelect={select} testIdFor={testIdFor} />
      ) : (
        <MapCanvas
          quests={shown}
          selectedId={selectedId}
          viewerId={persona.id}
          origin={ctx?.origin ?? null}
          walkMinutes={ctx?.walkMinutes ?? null}
          friendFaces={friendFaces}
          picks={picks}
          fitTo={fitTo}
          now={now}
          testIdFor={testIdFor}
          onSelect={creating ? noSelect : select}
          onMap={setMap}
          onUnsupported={onUnsupported}
          onPickLocation={startCreate}
          draft={creating}
          onDraftMove={moveDraft}
        />
      )}

      {show3d && map && (
        <World3D
          map={map}
          viewer={{ id: persona.id, name: ctx?.viewer.name ?? persona.name }}
          home={ctx?.origin ?? null}
          quests={shown}
          picks={picks}
          selectedId={selectedId}
          friendPins={allFriendPins}
          onSelect={select}
          onOpenFriend={openFriend}
          onExit={exit3d}
          onZoomOut={zoomOut3d}
          walkTo={walkQuest}
          onWalkStop={finishWalk}
          onArrive={onArrive}
        />
      )}

      {/* Keep the camera toggle clear of the action row and the 3D joystick. */}
      {!unsupported && (
        <div className={`absolute bottom-6 left-3 z-20 ${view === '3d' ? 'max-md:bottom-[250px]' : 'max-md:bottom-6'}`}>
          <div role="group" aria-label="Camera" className="flex gap-1 rounded-pill bg-fb-surface p-1 shadow-card">
            {(['map', '3d'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                data-testid={`view-${v}`}
                onClick={() => setView(v)}
                className={cn(
                  'h-8 rounded-pill px-3 text-[14px] font-semibold transition-colors',
                  view === v ? 'bg-fb-blue-tint text-fb-blue' : 'text-fb-text-2 hover:bg-fb-hover',
                )}
              >
                {v === 'map' ? 'Map' : '3D'}
              </button>
            ))}
          </div>
        </div>
      )}
      {viewNote && (
        <p role="status" className="absolute inset-x-4 top-[60px] z-[16] mx-auto max-w-[340px] rounded-card bg-fb-surface px-3 py-2 text-center text-[13px] text-fb-text-2 shadow-card">
          {viewNote}
        </p>
      )}

      {/* Explore / Friends, and the Muse filter chip beside them */}
      <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2">
        <div role="group" aria-label="Map view" className="flex gap-1 rounded-pill bg-fb-surface p-1 shadow-card">
          {(['explore', 'friends'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              data-testid={`map-mode-${m}`}
              onClick={() => setMode(m)}
              className={cn(
                'h-8 rounded-pill px-4 text-[15px] font-semibold transition-colors',
                mode === m ? 'bg-fb-blue-tint text-fb-blue' : 'text-fb-text-2 hover:bg-fb-hover',
              )}
            >
              {m === 'explore' ? 'Explore' : 'Friends'}
            </button>
          ))}
        </div>
        {tools && <button
          type="button"
          aria-pressed={filter.on}
          data-testid="muse-filter-toggle"
          title="Muse shows only what matches what you're looking for"
          onClick={() => filter.setOn(!filter.on)}
          className={cn(
            'h-10 whitespace-nowrap rounded-pill px-3 text-[15px] font-semibold shadow-card transition-colors',
            filter.on ? 'bg-fb-blue text-white hover:bg-fb-blue-hover' : 'bg-fb-surface text-fb-text hover:bg-fb-hover',
          )}
        >
          <span aria-hidden>✨</span> Muse filter
        </button>}
      </div>

      {filter.on && (
        <div className="pointer-events-none absolute inset-x-4 top-[60px] z-[15] flex flex-col items-center gap-1">
          <p
            role="status"
            data-testid="muse-filter-status"
            data-source={filter.source ?? (filter.loading ? 'loading' : 'error')}
            data-closest={filter.closest ? 'true' : undefined}
            className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-1.5 rounded-pill bg-fb-surface px-3 py-1 text-center text-[13px] text-fb-text-2 shadow-card"
          >
            {filter.loading ? (
              <span>Muse is filtering…</span>
            ) : filter.error ? (
              <span>Muse filter is unavailable, showing everything</span>
            ) : (
              <>
                {/* ✨ Muse only on live model picks, as in PlanSheet; mock and closest-plan answers carry no label. */}
                {filter.source === 'muse' && filter.live && !filter.closest && <MuseLabel className="py-0" />}
                <span>
                  {filter.keep?.size === 0 || shownCount === 0
                    ? filter.summary || 'Nothing matches right now'
                    : filter.closest
                      ? mode === 'explore'
                        ? `Nothing matches, here are the ${filter.keep?.size ?? 0} closest plans`
                        : `Nothing matches, here are ${filter.keep?.size ?? 0} friends sharing now`
                      : filter.source === 'fallback'
                        ? 'Muse is busy, showing a quick match'
                        : mode === 'explore'
                          ? `Muse is showing ${shown.length} of ${visible.length} plans`
                          : `Muse is showing ${shownFriends} of ${allFriendPins.length} friends`}
                </span>
                {keptItems.length > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <button
                      type="button"
                      data-testid="muse-filter-why"
                      aria-expanded={whyOpen}
                      onClick={() => setWhyOpen((v) => !v)}
                      className="font-semibold text-fb-blue hover:underline"
                    >
                      {whyOpen ? 'Hide why' : 'Why these?'}
                    </button>
                  </>
                )}
                {(filter.closest || filter.keep?.size === 0) && !ask && (
                  <>
                    <span aria-hidden>·</span>
                    <button type="button" data-testid="muse-filter-ask" onClick={() => setPlanOpen(true)} className="font-semibold text-fb-blue hover:underline">
                      Tell Muse what you&apos;re up for
                    </button>
                  </>
                )}
              </>
            )}
            <span aria-hidden>·</span>
            <button type="button" data-testid="muse-filter-show-all" onClick={() => filter.setOn(false)} className="font-semibold text-fb-blue hover:underline">
              Show all
            </button>
          </p>
          {whyOpen && keptItems.length > 0 && (
            <ul
              data-testid="muse-filter-reasons"
              className="pointer-events-auto max-h-[38vh] w-full max-w-[360px] overflow-y-auto rounded-card bg-fb-surface p-1 shadow-popover"
            >
              {keptItems.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    data-testid="muse-filter-reason-item"
                    onClick={() => {
                      setWhyOpen(false);
                      if (mode === 'explore') select(it.id);
                      else window.dispatchEvent(new CustomEvent('findmy:open', { detail: { id: it.id } }));
                    }}
                    className="flex w-full items-start gap-2 rounded-btn px-2 py-1.5 text-left hover:bg-fb-hover"
                  >
                    <span className="w-6 shrink-0 text-center text-[18px] leading-6" aria-hidden>{it.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold leading-5 text-fb-text">{it.name}</span>
                      <span className="block text-[13px] leading-4 text-fb-text-2">
                        <span className="font-semibold text-fb-blue">{reasonLabel}</span> · {it.reason}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {mode === 'friends' && (
        <>
          <FriendsLayer map={map} viewer={ctx?.viewer ?? null} keepIds={friendKeep} reasonFor={friendKeep ? reasonFor : null} />
          <PeopleButton map={map} />
          {visible.length > 0 && (
            <p role="status" data-testid="friends-filter-chip" className={cn('pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-pill bg-fb-surface px-3 py-1 text-[13px] text-fb-text-2 shadow-card', filter.on ? 'top-[96px]' : 'top-[60px]')}>
              Plans your friends joined · {visible.length}
            </p>
          )}
          {!unsupported && ctx && questsApi.data && visible.length === 0 && (
            <div className="pointer-events-none absolute inset-x-4 top-1/3 z-10 flex justify-center">
              <div className="pointer-events-auto w-full max-w-[340px] rounded-card bg-fb-surface shadow-card" data-testid="friends-empty">
                <EmptyState
                  title="No plans with friends right now"
                  body="When a friend joins a plan nearby, it shows up here."
                  action={<Button variant="secondary" onClick={() => setMode('explore')}>See all plans</Button>}
                  className="py-6"
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Up Next is the primary action when a plan is coming up. Hidden while a sheet is open,
          which already shows the plan (one next step on screen at a time). */}
      {!selectedId && !creating && !sheetOpen && upNext && (
        // Below the Muse filter status and the Friends chip, so neither is ever covered.
        <div className={cn('pointer-events-none absolute inset-x-3 z-20 flex justify-center',
          mode === 'friends' && visible.length > 0 ? (filter.on ? 'top-[132px]' : 'top-[96px]') : filter.on ? 'top-[100px]' : 'top-[60px]')}>
          <UpNextCard
            key={upNext.quest.id}
            plan={upNext}
            arrived={arrivedId === upNext.quest.id}
            walking={show3d && walkQuest?.id === upNext.quest.id}
            onGo={letsGo}
            onSee={select}
            className="pointer-events-auto w-full max-w-[440px]"
          />
        </div>
      )}

      {/* Dock the availability card at the edge to leave room for the map and avatar. */}
      {!selectedId && !creating && !sheetOpen && !upNext && (
        <div className={cn(
          'pointer-events-none absolute right-3 z-20 w-[calc(100%-24px)] max-w-[340px] md:left-4 md:right-auto md:top-16 md:max-w-[380px]',
          show3d
            ? mode === 'friends' && visible.length > 0
              ? filter.on ? 'top-32' : 'top-24'
              : filter.on ? 'top-24' : 'top-[60px]'
            : 'bottom-[136px] md:bottom-auto',
        )}>
          <BothFreeNudge className="pointer-events-auto w-full" />
        </div>
      )}

      {/* One row at the bottom: "I'm free" (it also shows your status), Your plans, and ＋ Post a plan. */}
      {!sheetOpen && !creating && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center max-md:bottom-20">
          <div className="pointer-events-auto flex items-center gap-2">
            <ImFreeButton />
            <Link href="/events?tab=going" aria-label="Your plans" title="Your plans"
              className="inline-flex size-12 items-center justify-center rounded-full bg-fb-surface text-fb-text shadow-popover hover:bg-fb-hover">
              <CalendarCheck size={22} aria-hidden />
            </Link>
            {!unsupported && (
              <button
                type="button"
                data-testid="create-plan-btn"
                aria-label="Post a plan"
                title="Post a plan (or long-press the map)"
                onClick={() => startCreate()}
                className="flex size-12 items-center justify-center rounded-full bg-fb-surface text-fb-blue shadow-popover hover:bg-fb-hover"
              >
                <Plus size={26} aria-hidden />
              </button>
            )}
          </div>
        </div>
      )}
      <PlanSheet />
      <TogetherSheet />
      {creating && (
        <CreatePlanSheet
          at={creating.at}
          friends={ctx?.friends ?? []}
          onMove={moveDraft}
          onEmoji={draftEmoji}
          onClose={() => setCreating(null)}
          onPosted={onPosted}
        />
      )}

      {!unsupported && (
        <MapAttribution className={cn('absolute bottom-0 right-0', selectedId && 'max-md:hidden')} />
      )}

      {selectedId && !creating && (
        <QuestPanel
          key={selectedId}
          questId={selectedId}
          walkMinutes={ctx?.walkMinutes[selectedId]}
          viewerId={persona.id}
          now={now}
          onClose={() => select(null)}
          onChanged={refetchAll}
          museReason={mode === 'explore' ? reasonFor(selectedId) : null}
        />
      )}
    </div>
  );
}
