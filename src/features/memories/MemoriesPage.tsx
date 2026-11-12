'use client';

// /memories: the Memories library. Opens on a MAP of every place the viewer has a memory (photo
// pins, several memories at one venue share a pin); a toggle switches to the LIST of crew cards
// (cover, date, people, album, Explore memory, Muse regroup). /memories?view=list and
// /memories#crew-<id> open the list. Refreshes live when a crew photo is captured.
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Images, List as ListIcon, Map as MapIcon, X } from 'lucide-react';
import { useChannel, useViewer } from '@/features/data';
import { usePersonaHandle } from '@/features/fb/shell';
import { MapAttribution } from '@/features/map';
import { AvatarStack, Card, cn, EmptyState, IconButton, LinkButton, Skeleton } from '@/features/ui';
import { loadCrewRows, type CrewRow } from './data';
import { formatJourneyDay, photoLabel } from './journey';
import type { MemoriesMapProps } from './MemoriesMap';
import { groupMemoryPins, type MemoryPin } from './memoryPins';
import { FRAME } from './MemoryJourney';
import { RegroupPanel } from './RegroupPanel';
import { useReducedMotion } from './useReducedMotion';
import { useRegroup } from './useRegroup';

const MemoriesMap = dynamic<MemoriesMapProps>(() => import('./MemoriesMap'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-shimmer bg-fb-skeleton" aria-hidden />,
});

type View = 'map' | 'list';
const PREVIEW_INSET = 200;

export function MemoriesPage() {
  const handle = usePersonaHandle();
  // Remount per persona so one persona's crews never flash under another.
  return <MemoriesView key={handle ?? 'loading'} handle={handle} />;
}

function initialView(): View {
  if (typeof window === 'undefined') return 'map';
  if (window.location.hash.startsWith('#crew-')) return 'list';
  return new URLSearchParams(window.location.search).get('view') === 'list' ? 'list' : 'map';
}

function MemoriesView({ handle }: { handle: string | null }) {
  const { viewer } = useViewer();
  const [crews, setCrews] = useState<CrewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [view, setViewState] = useState<View>('map');
  const [notice, setNotice] = useState<string | null>(null);
  useChannel([`user:${viewer.id}`], (_channel, payload) => {
    if (payload.type === 'memory' || payload.resync) setRefresh((value) => value + 1);
  });

  // Read ?view / #crew- after mount (avoids a server/client mismatch).
  useEffect(() => setViewState(initialView()), []);

  const setView = useCallback((v: View) => {
    setViewState(v);
    setNotice(null);
    const url = new URL(window.location.href);
    if (v === 'list') url.searchParams.set('view', 'list');
    else url.searchParams.delete('view');
    window.history.replaceState(window.history.state, '', url);
  }, []);

  useEffect(() => {
    if (!handle) return;
    let alive = true;
    setError(null);
    loadCrewRows()
      .then((rows) => { if (alive) setCrews(rows); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Could not load memories'); });
    return () => { alive = false; };
  }, [handle, refresh]);

  useEffect(() => {
    const target = window.location.hash.slice(1);
    if (crews && view === 'list' && target.startsWith('crew-')) document.getElementById(target)?.scrollIntoView({ block: 'start' });
  }, [crews, view]);

  const hasCrews = !!crews && crews.length > 0;

  if (view === 'map' && hasCrews && !error) {
    return <MapView crews={crews} onView={setView} onUnsupported={() => { setView('list'); setNotice('The map isn’t available on this device, so here’s the list.'); }} />;
  }

  return (
    <div className="mx-auto w-full max-w-[680px] px-0 pb-6 md:px-4 md:pt-4">
      <div className="flex items-start gap-3 px-4 py-3 md:px-0">
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-bold leading-[30px] text-fb-text">Memories</h1>
          <p className="mt-1 text-[15px] text-fb-text-2">Your Out Here hangouts: relive them, then get the crew together again.</p>
        </div>
        {hasCrews && <ViewToggle view={view} onView={setView} />}
      </div>
      {notice && <p className="mx-4 mb-3 rounded-card bg-fb-blue-tint px-3 py-2 text-[15px] text-fb-text md:mx-0" role="status">{notice}</p>}
      {error && <Card padded className="text-fb-text-2" role="alert">Could not load memories: {error}</Card>}
      {!error && crews === null && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1].map((i) => <Card key={i} padded><Skeleton className="h-6 w-40" /><Skeleton className="mt-3 h-40 w-full" /></Card>)}
        </div>
      )}
      {crews && crews.length === 0 && (
        <Card>
          <EmptyState
            icon={<Images size={40} />}
            title="No crews yet"
            body="Join a plan on Out Here. When it ends, the people you went with become a crew and your photos land here."
            action={<Link href="/out-here" className="font-semibold text-fb-blue hover:underline">Find a plan</Link>}
          />
        </Card>
      )}
      {handle && hasCrews && (
        <div className="flex flex-col gap-3">
          {crews.map((c) => <CrewCard key={c.id} crew={c} />)}
        </div>
      )}
    </div>
  );
}

function ViewToggle({ view, onView, className }: { view: View; onView: (v: View) => void; className?: string }) {
  return (
    <div role="group" aria-label="Memories view" className={cn('flex shrink-0 gap-1 rounded-pill bg-fb-surface p-1 shadow-card', className)}>
      {(['map', 'list'] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          data-testid={`memories-view-${v}`}
          onClick={() => onView(v)}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-pill px-3 text-[15px] font-semibold transition-colors',
            view === v ? 'bg-fb-blue-tint text-fb-blue' : 'text-fb-text-2 hover:bg-fb-hover',
          )}
        >
          {v === 'map' ? <MapIcon size={16} aria-hidden /> : <ListIcon size={16} aria-hidden />}
          {v === 'map' ? 'Map' : 'List'}
        </button>
      ))}
    </div>
  );
}

function MapView({ crews, onView, onUnsupported }: { crews: CrewRow[]; onView: (v: View) => void; onUnsupported: () => void }) {
  const reducedMotion = useReducedMotion();
  const { pins, unplaced } = useMemo(() => groupMemoryPins(crews), [crews]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = pins.find((p) => p.id === selectedId) ?? null;
  const total = crews.length;

  return (
    <div className={FRAME} data-testid="memories-map-view">
      <h1 className="sr-only">Memories</h1>
      <div className="relative min-h-0 flex-1">
        <MemoriesMap
          pins={pins}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onUnsupported={onUnsupported}
          reducedMotion={reducedMotion}
          bottomInset={selected ? PREVIEW_INSET : 0}
        />

        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex items-center justify-between gap-2 px-3">
          <span className="pointer-events-auto rounded-pill bg-fb-surface px-3 py-1.5 text-[15px] font-semibold text-fb-text shadow-card">
            {total} {total === 1 ? 'memory' : 'memories'}
          </span>
          <ViewToggle view="map" onView={onView} className="pointer-events-auto" />
        </div>

        {pins.length === 0 && (
          <p className="absolute inset-x-6 top-1/2 z-10 -translate-y-1/2 rounded-card bg-fb-surface p-4 text-center text-[15px] text-fb-text-2 shadow-card">
            None of your memories have a location yet. <button type="button" className="font-semibold text-fb-blue hover:underline" onClick={() => onView('list')}>See the list</button>
          </p>
        )}

        {!selected && pins.length > 0 && (
          <p className="pointer-events-none absolute inset-x-0 bottom-8 z-10 flex justify-center px-3">
            <span className="rounded-pill bg-fb-surface/95 px-3 py-1.5 text-[13px] text-fb-text-2 shadow-card">
              Tap a photo to relive that hangout
              {unplaced.length > 0 && (
                <> · <button type="button" className="pointer-events-auto font-semibold text-fb-blue hover:underline" onClick={() => onView('list')}>
                  {unplaced.length} without a place
                </button></>
              )}
            </span>
          </p>
        )}

        {selected && <PinPreview pin={selected} onClose={() => setSelectedId(null)} />}

        <MapAttribution className="absolute bottom-0 right-0" />
      </div>
    </div>
  );
}

function PinPreview({ pin, onClose }: { pin: MemoryPin<CrewRow>; onClose: () => void }) {
  const single = pin.memories.length === 1 ? pin.memories[0] : null;
  return (
    <section
      aria-label={pin.venueName ?? 'Memories here'}
      className="absolute inset-x-0 bottom-0 z-20 max-h-[60%] overflow-y-auto rounded-t-[16px] bg-fb-surface p-3 shadow-popover md:inset-x-3 md:bottom-6 md:rounded-card"
      data-testid="memory-pin-preview"
    >
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold text-fb-text">
          {pin.emoji && <span aria-hidden className="mr-1">{pin.emoji}</span>}
          {pin.venueName ?? single?.name ?? 'Memories here'}
          {!single && <span className="ml-1 font-normal text-fb-text-2">· {pin.memories.length} memories</span>}
        </h2>
        <IconButton label="Close" onClick={onClose}><X size={20} aria-hidden /></IconButton>
      </div>
      {single ? <MemoryPreviewRow crew={single} large /> : (
        <ul className="mt-1 flex flex-col gap-1">
          {pin.memories.map((c) => <li key={c.id}><MemoryPreviewRow crew={c} /></li>)}
        </ul>
      )}
    </section>
  );
}

function MemoryPreviewRow({ crew, large = false }: { crew: CrewRow; large?: boolean }) {
  const href = `/memories/${encodeURIComponent(crew.id)}`;
  const cover = crew.memories[0] ?? null;
  const day = formatJourneyDay(crew.place?.startsAt ?? crew.lastHangoutAt);
  const others = (crew.meta?.members ?? []).filter((m) => m.id !== crew.viewerId).map((m) => m.name.split(' ')[0]);
  const meta = [day, photoLabel(crew.memories.length)].filter(Boolean).join(' · ');

  if (!large) {
    return (
      <Link href={href} className="flex items-center gap-3 rounded-card p-2 hover:bg-fb-hover focus-visible:outline-2 focus-visible:outline-fb-blue" data-testid="memory-preview-row">
        <Thumb url={cover?.photoUrl ?? null} size="h-12 w-12" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-fb-text">{crew.name}</span>
          <span className="block truncate text-[13px] text-fb-text-2">{meta}</span>
        </span>
        <ChevronRight size={18} className="text-fb-text-2" aria-hidden />
      </Link>
    );
  }
  return (
    <div className="mt-2">
      <div className="flex gap-3">
        <Thumb url={cover?.photoUrl ?? null} size="h-20 w-20" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-fb-text">{crew.name}</p>
          <p className="truncate text-[13px] text-fb-text-2">{meta}</p>
          {others.length > 0 && <p className="truncate text-[13px] text-fb-text-2">With {others.join(', ')}</p>}
          {cover?.caption && <p className="mt-1 line-clamp-2 text-[13px] text-fb-text">&ldquo;{cover.caption}&rdquo;</p>}
        </div>
      </div>
      <LinkButton href={href} block className="mt-3" icon={<MapIcon size={16} aria-hidden />} data-testid="explore-memory">
        Explore memory
      </LinkButton>
    </div>
  );
}

function Thumb({ url, size }: { url: string | null; size: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-fb-bg text-fb-text-2', size)}>
      {url && !broken
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setBroken(true)} />
        : <Images size={20} aria-hidden />}
    </span>
  );
}

function CrewCard({ crew }: { crew: CrewRow }) {
  const members = crew.meta?.members ?? [];
  const regroup = useRegroup(crew.id, crew.meta, crew.viewerId);
  const href = `/memories/${encodeURIComponent(crew.id)}`;
  const [cover, ...rest] = crew.memories;
  const day = formatJourneyDay(crew.lastHangoutAt);
  const others = members.filter((m) => m.id !== crew.viewerId).map((m) => m.name.split(' ')[0]);

  return (
    <Card as="section" id={`crew-${crew.id}`} className="scroll-mt-16 overflow-hidden" aria-label={crew.name} data-testid="crew-card">
      {cover && (
        <Link href={href} className="group relative block bg-fb-bg focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-fb-blue" aria-label={`Explore ${crew.name}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover.photoUrl} alt={cover.caption || `${crew.name} photo`} className="aspect-[16/9] w-full object-cover" loading="lazy" />
          <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[13px] font-semibold text-white">
            <Images size={14} aria-hidden /> {photoLabel(crew.memories.length)}
          </span>
        </Link>
      )}

      <div className="flex items-start gap-3 p-4 pb-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold text-fb-text">
            <Link href={href} className="hover:underline">{crew.name}</Link>
          </h2>
          <p className="text-[13px] text-fb-text-2">{[crew.meta?.originTitle, day].filter(Boolean).join(' · ')}</p>
          {others.length > 0 && <p className="mt-0.5 text-[13px] text-fb-text-2">With {others.join(', ')}</p>}
          {crew.sharedPrefs.length > 0 && <p className="mt-0.5 text-[13px] text-fb-text-2">Into: {crew.sharedPrefs.join(', ')}</p>}
        </div>
        {members.length > 0 && <AvatarStack people={members.map((m) => ({ name: m.name, src: m.avatarUrl }))} size={32} max={5} />}
      </div>

      {rest.length > 0 && (
        <ul className="grid grid-cols-4 gap-0.5 px-4" aria-label={`${crew.name} album`}>
          {rest.slice(0, 4).map((m, i) => (
            <li key={m.id} className="relative aspect-square overflow-hidden rounded-[6px] bg-fb-bg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.photoUrl} alt={m.caption || `${crew.name} photo`} className="h-full w-full object-cover" loading="lazy" />
              {i === 3 && rest.length > 4 && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[17px] font-semibold text-white">+{rest.length - 4}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {crew.memories.length === 0 && <p className="px-4 text-[15px] text-fb-text-2">No photos in this album yet.</p>}
      {cover?.caption && <p className="px-4 pt-2 text-[15px] text-fb-text">&ldquo;{cover.caption}&rdquo;</p>}

      <div className="flex flex-col gap-2 p-4">
        <LinkButton href={href} variant="secondary" block icon={<MapIcon size={16} aria-hidden />} data-testid="explore-memory">
          Explore memory <ChevronRight size={16} aria-hidden />
        </LinkButton>
        <RegroupPanel state={regroup} label="Get this group together again" />
      </div>
    </Card>
  );
}
