'use client';
// The Out Here tab: full-height map with the Explore / Friends toggle, quest pins with live seat
// badges, the quest sheet, and the Find My and "I'm free" layers from the other Out Here areas.
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { CalendarCheck } from 'lucide-react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi, useQuests, useViewer } from '@/features/data';
import { FriendsLayer, PeopleButton, useFriendPins } from '@/features/map/friends';
import { BothFreeNudge, ImFreeButton, PlanSheet, StatusPill, usePlanSuggestions } from '@/features/outhere';
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
    const shown = new Set(visible.map((q) => q.id));
    const ids = planPicks.questIds.filter((id) => shown.has(id));
    return ids.length > 0 ? ids : null;
  }, [planPicks, visible]);
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
        <FallbackList quests={visible} walkMinutes={ctx?.walkMinutes ?? {}} now={now} onSelect={select} testIdFor={testIdFor} />
      ) : (
        <MapCanvas
          quests={visible}
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

      {/* Explore / Friends */}
      <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
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
      </div>

      {mode === 'friends' && (
        <>
          <FriendsLayer map={map} viewer={ctx?.viewer ?? null} />
          <PeopleButton map={map} />
          {visible.length > 0 && (
            <p role="status" data-testid="friends-filter-chip" className="pointer-events-none absolute left-1/2 top-[60px] z-10 -translate-x-1/2 whitespace-nowrap rounded-pill bg-fb-surface px-3 py-1 text-[13px] text-fb-text-2 shadow-card">
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

      {/* "You and Maya are both free": under the toggle (and under the Friends filter chip). */}
      {!selectedId && (
        <div className={cn('pointer-events-none absolute inset-x-3 z-20 flex justify-center', mode === 'friends' && visible.length > 0 ? 'top-[96px]' : 'top-[60px]')}>
          <BothFreeNudge className="pointer-events-auto w-full max-w-[440px]" />
        </div>
      )}

      {/* ImFreeButton is an unpositioned pill; place it above the map canvas, bottom centre,
          with the viewer's status pill above it. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex flex-col items-center gap-2 max-md:bottom-20">
        <StatusPill className="pointer-events-auto" />
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
        />
      )}
    </div>
  );
}
