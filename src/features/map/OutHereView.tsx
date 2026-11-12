'use client';
// The Out Here tab: full-height map with the Explore / Friends toggle, quest pins with live seat
// badges, the quest sheet, and the Find My and "I'm free" layers from the other Out Here areas.
import dynamic from 'next/dynamic';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi, useQuests, useViewer } from '@/features/data';
import { FriendsLayer, PeopleButton } from '@/features/map/friends';
import { ImFreeButton, PlanSheet } from '@/features/outhere';
import { cn } from '@/features/ui';
import { DEMO_CENTER, DEMO_QUESTS, seedId, type Quest } from '@/shared';
import { FallbackList } from './FallbackList';
import { MapAttribution } from './MapAttribution';
import { QuestPanel } from './QuestPanel';
import type { MapContext, MapMode } from './types';

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

  // ?quest=<id> deep link opens that quest's sheet.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('quest');
    if (id) setSelectedId(id);
  }, []);

  const ctx = ctxApi.data && ctxApi.data.viewer.id === persona.id ? ctxApi.data : null;
  const live = useMemo(() => (questsApi.data?.quests ?? []).filter((q) => q.status !== 'done' && new Date(q.endsAt) > now), [questsApi.data, now]);
  const visible: Quest[] = useMemo(() => {
    if (mode === 'explore') return live;
    const friends = new Set(ctx?.friendIds ?? []);
    return live.filter((q) => q.memberIds.some((m) => friends.has(m)));
  }, [mode, live, ctx]);

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
          {!unsupported && visible.length === 0 && live.length > 0 && (
            <p role="status" className="pointer-events-none absolute left-1/2 top-16 z-10 -translate-x-1/2 whitespace-nowrap rounded-pill bg-fb-surface px-3 py-1.5 text-[13px] text-fb-text-2 shadow-card">
              No friends have joined a plan yet
            </p>
          )}
        </>
      )}

      <ImFreeButton />
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
