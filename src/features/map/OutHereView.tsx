'use client';
// The Out Here tab: full-height map with the Explore / Friends toggle, quest pins with live seat
// badges, the quest sheet, and the Find My and "I'm free" layers from the other Out Here areas.
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { CalendarCheck, Images } from 'lucide-react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApi, useQuests, useViewer } from '@/features/data';
import { FriendsLayer, PeopleButton, useFriendPins } from '@/features/map/friends';
import { ImFreeButton, MuseLabel, PlanSheet, setPlanOpen, useMuseFilter, usePlanAsk, usePlanSuggestions } from '@/features/outhere';
import { Button, cn, EmptyState } from '@/features/ui';
import { DEMO_CENTER, DEMO_QUESTS, seedId, type LatLng, type Quest } from '@/shared';
import { FallbackList } from './FallbackList';
import { MapAttribution } from './MapAttribution';
import { QuestPanel } from './QuestPanel';
import type { FriendFace, MapContext, MapMode } from './types';

const MapCanvas = dynamic(() => import('./MapCanvas'), { ssr: false });

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

  // ?quest=<id> deep link opens that quest's sheet; ?mode=friends|explore sets the toggle.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('quest');
    if (id) setSelectedId(id);
    const m = params.get('mode');
    if (m === 'friends' || m === 'explore') setMode(m);
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
    if (!map) return;
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
  const onUnsupported = useCallback(() => setUnsupported(true), []);
  const refetchAll = useCallback(() => { void questsApi.refetch(); void ctxApi.refetch(); }, [questsApi, ctxApi]);

  return (
    <div className="relative h-[calc(100dvh-112px)] overflow-hidden bg-[#EEF0F2] md:h-[calc(100dvh-56px)]" data-testid="out-here-map" data-mode={mode}>
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
          onSelect={select}
          onMap={setMap}
          onUnsupported={onUnsupported}
        />
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
          {/* Memories: past hangouts, next to the live views. A link, not a map mode. */}
          <Link
            href="/memories"
            data-testid="map-memories-link"
            aria-label="Memories"
            title="Memories"
            className="flex h-8 items-center gap-1.5 rounded-pill px-3 text-[15px] font-semibold text-fb-text-2 transition-colors hover:bg-fb-hover sm:px-4"
          >
            <Images size={17} aria-hidden />
            <span className="max-sm:sr-only">Memories</span>
          </Link>
        </div>
        <button
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
        </button>
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

      {/* ImFreeButton is an unpositioned pill; place it above the map canvas, bottom centre. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center max-md:bottom-20">
        <div className="pointer-events-auto flex items-center gap-2">
          <ImFreeButton />
          <Link href="/events?tab=going" className="inline-flex min-h-10 items-center gap-1.5 rounded-pill bg-fb-surface px-3 text-sm font-semibold text-fb-text shadow-card hover:bg-fb-hover">
            <CalendarCheck size={17} aria-hidden />Your plans
          </Link>
        </div>
      </div>
      <PlanSheet />

      {!unsupported && (
        <MapAttribution className={cn('absolute bottom-0 right-0', selectedId && 'max-md:hidden')} />
      )}

      {selectedId && (
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
