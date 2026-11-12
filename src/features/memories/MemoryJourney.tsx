'use client';

// /memories/[crewId]: one crew's hangout as an explorable journey. The UI owns the selection,
// timeline, sheet and Muse state; the map (JourneyMap from ./mapSlot) only receives props.
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Images } from 'lucide-react';
import { usePersonaHandle } from '@/features/fb/shell';
import { Card, EmptyState, IconLink, Skeleton } from '@/features/ui';
import { CrewNotFoundError, loadJourney, type JourneyData } from './data';
import { formatJourneyDay, photoLabel, stopLabel, toMapPoints } from './journey';
import { JourneyMap } from './mapSlot';
import { MemoryTimeline } from './MemoryTimeline';
import { MomentSheet, type SheetMode } from './MomentSheet';
import { useReducedMotion } from './useReducedMotion';
import { useRegroup } from './useRegroup';

export const FRAME = 'relative flex h-[calc(100dvh-112px)] flex-col overflow-hidden bg-fb-surface md:h-[calc(100dvh-88px)] md:rounded-card md:shadow-card';

export function MemoryJourney({ crewId }: { crewId: string }) {
  const handle = usePersonaHandle();
  const [data, setData] = useState<JourneyData | null>(null);
  const [error, setError] = useState<{ notFound: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!handle) return;
    let alive = true;
    setData(null);
    setError(null);
    loadJourney(crewId)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => {
        if (alive) setError({ notFound: e instanceof CrewNotFoundError, text: e instanceof Error ? e.message : 'Could not load this memory' });
      });
    return () => { alive = false; };
  }, [crewId, handle]);

  if (error) {
    return (
      <div className="p-3 md:p-0">
        <Card>
          <EmptyState
            icon={<Images size={40} />}
            title={error.notFound ? 'Memory not found' : 'Could not load this memory'}
            body={error.notFound ? 'It may belong to another account, or the crew was removed.' : error.text}
            action={<Link href="/memories" className="font-semibold text-fb-blue hover:underline">Back to Memories</Link>}
          />
        </Card>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={FRAME} aria-busy="true" aria-label="Loading memory">
        <div className="flex items-center gap-3 p-3"><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-5 w-48" /></div>
        <Skeleton className="m-3 flex-1 rounded-card" />
      </div>
    );
  }
  return <JourneyView data={data} />;
}

function JourneyView({ data }: { data: JourneyData }) {
  const { journey, meta, viewerId } = data;
  const reducedMotion = useReducedMotion();
  const points = useMemo(() => toMapPoints(journey), [journey]);
  const [selectedId, setSelectedId] = useState<string | null>(journey.stops[0]?.id ?? null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [sheetMode, setSheetMode] = useState<SheetMode>('collapsed');
  const [focusRequest, setFocusRequest] = useState(0);
  const regroup = useRegroup(journey.crewId, meta, viewerId);

  const index = Math.max(0, journey.stops.findIndex((s) => s.id === selectedId));
  const stop = journey.stops[index] ?? null;

  const select = useCallback((id: string) => {
    setSelectedId((prev) => {
      if (prev !== id) setPhotoIndex(0);
      return id;
    });
    setSheetOpen(true);
    setFocusRequest((n) => n + 1);
  }, []);

  const step = useCallback((delta: -1 | 1) => {
    const next = journey.stops[index + delta];
    if (next) select(next.id);
  }, [index, journey.stops, select]);

  const others = journey.members.filter((m) => m.id !== viewerId).map((m) => m.name.split(' ')[0]);
  const sublabel = others.length > 0 ? `Plan another hangout with ${others.join(' and ')}` : 'Plan another hangout with this crew';
  const day = formatJourneyDay(journey.date);

  return (
    <div className={FRAME} data-testid="memory-journey">
      <header className="z-30 flex items-center gap-2 border-b border-fb-divider-soft bg-fb-surface px-2 py-2">
        <IconLink href="/memories" label="Back to Memories"><ArrowLeft size={20} aria-hidden /></IconLink>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-semibold leading-[22px] text-fb-text">{journey.title}</h1>
          <p className="truncate text-[13px] text-fb-text-2">
            {[day, stopLabel(journey.stops.length), photoLabel(journey.photoCount)].filter(Boolean).join(' · ')}
          </p>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <JourneyMap
          points={points}
          selectedMemoryId={stop?.id ?? null}
          onSelectMemory={select}
          cameraMode="overview"
          focusRequest={focusRequest}
          reducedMotion={reducedMotion}
          className="absolute inset-0"
        />

        {journey.stops.length > 0 && (
          <MemoryTimeline
            stops={journey.stops}
            selectedId={stop?.id ?? null}
            onSelect={select}
            reducedMotion={reducedMotion}
            className={sheetOpen ? 'absolute inset-x-0 bottom-[96px] z-10 md:bottom-[108px]' : 'absolute inset-x-0 bottom-2 z-10'}
          />
        )}

        {stop && sheetOpen && (
          <MomentSheet
            stop={stop}
            stopIndex={index}
            stopCount={journey.stops.length}
            photoIndex={Math.min(photoIndex, Math.max(0, stop.photos.length - 1))}
            onPhotoIndex={setPhotoIndex}
            mode={sheetMode}
            onMode={setSheetMode}
            onDismiss={() => { setSheetOpen(false); setSheetMode('collapsed'); }}
            onStep={step}
            crewMembers={journey.members}
            regroup={regroup}
            regroupSublabel={sublabel}
            reducedMotion={reducedMotion}
          />
        )}
      </div>
    </div>
  );
}
