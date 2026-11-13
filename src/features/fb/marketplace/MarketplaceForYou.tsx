'use client';
// Marketplace, picked by Muse from what you watch. Muse reads the viewer's Watch history into a
// few topics (each with the videos behind it) and shows only the listings that fit one, with a
// reason and the evidence. Everything else is hidden behind "Show all". Topic chips switch a
// topic off. A new view on the Watch page refetches (user:<id> {type:"watch"}), so a video
// watched just now shows up here as "New".
import { ChevronDown, ChevronUp, MapPin, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useApi, useViewer } from '@/features/data';
import { MuseLabel, MuseStepsDone, MuseStepsLoading, type MuseStep } from '@/features/outhere';
import { Avatar, cn } from '@/features/ui';
import { DEMO_CENTER, formatDemoTime } from '@/shared';
import type { Listing } from '@/shared';
import type { MarketplacePick, MarketplacePicksResponse, PersonCard } from '@/shared/api';
import { PageHeader } from '../shell';

const LOADING = [
  'Reading what you watched this week…',
  'Finding what you’re into…',
  'Checking listings near you…',
  'Keeping only what fits…',
] as const;
const EXCLUDE_KEY = 'outhere:marketplace-exclude';

const money = (n: number) => (n === 0 ? 'Free' : `$${Number.isInteger(n) ? n : n.toFixed(2)}`);
const cleanTitle = (t: string) => t.replace(/\s+[-–]\s+\$\d[\d.,]*\s*$/, '').trim();

function useExclude(): [string[], (next: string[]) => void] {
  const [ex, setEx] = useState<string[]>([]);
  useEffect(() => {
    try { setEx(JSON.parse(sessionStorage.getItem(EXCLUDE_KEY) ?? '[]') as string[]); } catch { /* private mode */ }
  }, []);
  const set = (next: string[]) => {
    setEx(next);
    try { sessionStorage.setItem(EXCLUDE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };
  return [ex, set];
}

function steps(r: MarketplacePicksResponse, excluded: string[]): MuseStep[] {
  const active = r.topics.filter((t) => !excluded.includes(t.name));
  const time = r.ms >= 100 ? ` · ${(r.ms / 1000).toFixed(1)} s` : '';
  return [
    { key: 'intent', tone: r.videosRead ? 'ok' : 'muted', text: r.videosRead ? `Read ${r.videosRead} videos you watched this week` : 'You haven’t watched anything this week' },
    { key: 'friends', tone: active.length ? 'ok' : 'muted', text: active.length ? `You’re into ${active.map((t) => t.name).join(' · ')}` : 'Nothing stood out yet' },
    { key: 'plans', tone: 'ok', text: `Checked ${r.checked} listings near you` },
    {
      key: 'rank', tone: r.picks.length ? 'ok' : 'muted',
      text: r.source === 'fallback'
        ? `Muse didn’t answer in time, so matched by words: kept ${r.picks.length}${time}`
        : `${r.source === 'mock' ? 'Picked offline (mock): ' : 'Muse kept '}${r.picks.length}, hid ${r.hidden.length}${time}`,
    },
  ];
}

export function MarketplaceForYou() {
  const { viewer } = useViewer();
  const [exclude, setExclude] = useExclude();
  const [showAll, setShowAll] = useState(false);
  const path = `/api/muse/marketplace-picks?lat=${DEMO_CENTER.lat}&lng=${DEMO_CENTER.lng}${exclude.length ? `&exclude=${encodeURIComponent(exclude.join(','))}` : ''}`;
  const api = useApi<MarketplacePicksResponse>(path, [`user:${viewer.id}`]);
  const r = api.data;
  const { refetch } = api;
  // Back from the Watch page (or another tab): pick again.
  useEffect(() => {
    const on = () => { if (document.visibilityState === 'visible') void refetch(); };
    window.addEventListener('focus', on);
    document.addEventListener('visibilitychange', on);
    return () => { window.removeEventListener('focus', on); document.removeEventListener('visibilitychange', on); };
  }, [refetch]);
  const doneSteps = useMemo(() => (r ? steps(r, exclude) : []), [r, exclude]);
  const live = r?.source === 'muse';

  return (
    <div className="pb-6" data-testid="marketplace-for-you">
      <PageHeader
        title="Marketplace"
        subtitle={<span className="inline-flex flex-wrap items-center gap-1.5"><span aria-hidden>✨</span> Picked by Muse from what you watch</span>}
        action={<Link href="/watch" className="text-[15px] font-semibold text-fb-blue hover:underline">Watch</Link>}
      />
      <div className="flex flex-col gap-3 px-4 md:px-0">
        {!r && <MuseStepsLoading steps={LOADING} className="max-w-[560px]" />}
        {api.error && !r && <p className="text-[15px] text-fb-text-2">Muse couldn’t load your picks. Try again in a moment.</p>}

        {r && (
          <>
            <TopicChips topics={r.topics.map((t) => t.name)} exclude={exclude} setExclude={setExclude} live={live} />
            <div className="max-w-[560px]"><MuseStepsDone steps={doneSteps} showMuse={live} /></div>

            {r.picks.length === 0 ? (
              <div className="rounded-card bg-fb-surface p-4 text-[15px] text-fb-text shadow-card" data-testid="picks-empty">
                {r.videosRead === 0
                  ? <>Watch a few videos and Muse will pick from Marketplace for you. <Link href="/watch" className="font-semibold text-fb-blue hover:underline">Go to Watch</Link></>
                  : 'Nothing nearby fits what you watch right now. Muse will keep looking.'}
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="picks">
                {r.picks.map((p) => <PickCard key={p.listing.id} p={p} live={live} />)}
              </ul>
            )}

            {r.hidden.length > 0 && (
              <div className="mt-2">
                <button
                  type="button"
                  data-testid="picks-show-all"
                  aria-expanded={showAll}
                  onClick={() => setShowAll((v) => !v)}
                  className="flex items-center gap-1 text-[15px] font-semibold text-fb-text-2 hover:underline"
                >
                  Muse hid {r.hidden.length} items that don’t match what you watch · {showAll ? 'Hide' : 'Show all'}
                  {showAll ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
                </button>
                {showAll && (
                  <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="picks-hidden">
                    {r.hidden.map((h) => <HiddenCard key={h.listing.id} listing={h.listing} seller={h.seller} />)}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TopicChips({ topics, exclude, setExclude, live }: { topics: string[]; exclude: string[]; setExclude: (x: string[]) => void; live: boolean }) {
  if (topics.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="taste-chips">
      {live ? <MuseLabel /> : null}
      <span className="text-[13px] text-fb-text-2">Based on what you watch:</span>
      {topics.map((t) => {
        const off = exclude.includes(t);
        return (
          <button
            key={t}
            type="button"
            aria-pressed={!off}
            title={off ? `Use ${t} again` : `Stop using ${t}`}
            onClick={() => setExclude(off ? exclude.filter((x) => x !== t) : [...exclude, t])}
            className={cn(
              'inline-flex h-8 items-center gap-1 rounded-pill px-3 text-[13px] font-semibold capitalize',
              off ? 'bg-fb-input text-fb-text-2 line-through' : 'bg-fb-blue-tint text-fb-blue hover:bg-[#DBE7F2]',
            )}
          >
            {t}
            {off ? <Plus size={14} aria-hidden /> : <X size={14} aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

function PickCard({ p, live }: { p: MarketplacePick; live: boolean }) {
  const [why, setWhy] = useState(false);
  const [shown, setShown] = useState(!p.isNew);
  useEffect(() => { if (p.isNew) { const id = window.requestAnimationFrame(() => setShown(true)); return () => window.cancelAnimationFrame(id); } }, [p.isNew]);
  const l = p.listing;
  return (
    <li
      data-testid="pick-card"
      data-new={p.isNew ? 'true' : undefined}
      className={cn(
        'flex flex-col overflow-hidden rounded-card bg-fb-surface shadow-card transition-all duration-500 motion-reduce:transition-none',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
        p.isNew && 'ring-2 ring-fb-blue',
      )}
    >
      <div className="relative aspect-[4/3] bg-fb-input">
        {l.imageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={l.imageUrl} alt="" className="size-full object-cover" />
          : <span className="flex size-full items-center justify-center text-[48px]" aria-hidden>🛍️</span>}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-pill bg-white/95 px-2 py-0.5 text-[12px] font-semibold capitalize text-fb-blue shadow-card">
          ✨ {p.topic}
        </span>
        {p.isNew && <span className="absolute right-2 top-2 rounded-pill bg-fb-blue px-2 py-0.5 text-[12px] font-semibold text-white shadow-card">New</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div>
          <p className="text-[17px] font-bold leading-5 text-fb-text">{money(l.priceUsd)}</p>
          <p className="text-[15px] leading-5 text-fb-text">{cleanTitle(l.title)}</p>
          <p className="text-[13px] text-fb-text-2">{p.seller.name}{p.driveMin !== null ? ` · ${p.driveMin} min drive` : ''}</p>
        </div>
        <p data-testid="pick-reason" className="text-[14px] leading-[19px] text-fb-text">
          {live && <span className="mr-1 font-semibold text-fb-blue">✨ Muse</span>}{p.reason}
        </p>
        {p.openHouse && (
          <Link
            href={`/out-here?quest=${p.openHouse.questId}`}
            data-testid="pick-open-house"
            className="flex items-center gap-1.5 rounded-btn bg-fb-input px-2.5 py-1.5 text-[13px] font-semibold text-fb-text hover:bg-fb-hover"
          >
            <MapPin size={15} className="shrink-0 text-fb-blue" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{p.openHouse.title} · {formatDemoTime(p.openHouse.startsAt)} at {p.openHouse.venueName}</span>
            <span className="text-fb-blue">See it on the map</span>
          </Link>
        )}
        <button
          type="button"
          data-testid="pick-why"
          aria-expanded={why}
          onClick={() => setWhy((v) => !v)}
          className="mt-auto flex items-center gap-1 self-start text-[13px] font-semibold text-fb-blue hover:underline"
        >
          Why this? {why ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
        </button>
        {why && (
          <div data-testid="pick-evidence" className="flex flex-col gap-1.5 border-t border-fb-divider pt-2">
            <p className="text-[12px] text-fb-text-2">From videos you watched:</p>
            {p.evidence.slice(0, 4).map((e) => (
              <div key={e.video.key} className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.video.posterUrl} alt="" className="h-9 w-14 shrink-0 rounded object-cover bg-fb-input" />
                <span className="min-w-0 flex-1 text-[13px] leading-4">
                  <span className="line-clamp-1 text-fb-text">{e.video.title}</span>
                  <span className="text-fb-text-2">{e.seconds < 60 ? `${e.seconds} s` : `${e.minutes} min`} watched{e.video.creator ? ` · ${e.video.creator.name}` : ''}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function HiddenCard({ listing, seller }: { listing: Listing; seller: PersonCard }) {
  return (
    <li className="overflow-hidden rounded-card bg-fb-surface opacity-70 shadow-card" data-testid="hidden-card">
      <div className="aspect-square bg-fb-input">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {listing.imageUrl && <img src={listing.imageUrl} alt="" className="size-full object-cover" />}
      </div>
      <div className="p-2">
        <p className="text-[15px] font-bold leading-5 text-fb-text">{money(listing.priceUsd)}</p>
        <p className="line-clamp-1 text-[13px] text-fb-text">{cleanTitle(listing.title)}</p>
        <p className="flex items-center gap-1 text-[12px] text-fb-text-2"><Avatar src={seller.avatarUrl} name={seller.name} size={20} />Not from what you watch</p>
      </div>
    </li>
  );
}

