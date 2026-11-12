'use client';

// /memories: the Memories library. One card per crew (a past Out Here hangout): cover photo,
// date, who was there, the album, an entry into the journey, and Muse regroup. Refreshes live
// when a crew photo is captured (user:<id> 'memory' events); /memories#crew-<id> scrolls to a crew.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronRight, Images, Map as MapIcon } from 'lucide-react';
import { useChannel, useViewer } from '@/features/data';
import { usePersonaHandle } from '@/features/fb/shell';
import { AvatarStack, Card, EmptyState, LinkButton, Skeleton } from '@/features/ui';
import { loadCrewRows, type CrewRow } from './data';
import { formatJourneyDay, photoLabel } from './journey';
import { RegroupPanel } from './RegroupPanel';
import { useRegroup } from './useRegroup';

export function MemoriesPage() {
  const handle = usePersonaHandle();
  // Remount per persona so one persona's crews never flash under another.
  return <MemoriesView key={handle ?? 'loading'} handle={handle} />;
}

function MemoriesView({ handle }: { handle: string | null }) {
  const { viewer } = useViewer();
  const [crews, setCrews] = useState<CrewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  useChannel([`user:${viewer.id}`], (_channel, payload) => {
    if (payload.type === 'memory' || payload.resync) setRefresh((value) => value + 1);
  });

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
    if (crews && target.startsWith('crew-')) document.getElementById(target)?.scrollIntoView({ block: 'start' });
  }, [crews]);

  return (
    <div className="mx-auto w-full max-w-[680px] px-0 pb-6 md:px-4 md:pt-4">
      <div className="px-4 py-3 md:px-0">
        <h1 className="text-[24px] font-bold leading-[30px] text-fb-text">Memories</h1>
        <p className="mt-1 text-[15px] text-fb-text-2">Your Out Here hangouts: relive them, then get the crew together again.</p>
      </div>
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
      {handle && crews && crews.length > 0 && (
        <div className="flex flex-col gap-3">
          {crews.map((c) => <CrewCard key={c.id} crew={c} />)}
        </div>
      )}
    </div>
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
