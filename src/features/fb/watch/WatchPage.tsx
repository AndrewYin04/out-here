'use client';
// Watch: the fictional video catalogue (src/shared/seed/videos.json) as a grid. These are posters,
// not real clips: tapping one plays a preview (the poster with a slow zoom and a progress bar),
// and closing it records how long it played. Muse reads that history for Marketplace picks, so
// the player says so and links there.
import { Check, Pause, Play, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiPost, useApi } from '@/features/data';
import { Avatar, cn } from '@/features/ui';
import type { WatchResponse, WatchVideo } from '@/shared/api';
import { PageHeader } from '../shell';

/** The preview "plays" this long; that is what gets recorded if it runs to the end. */
const PREVIEW_SEC = 8;

export function WatchPage() {
  const api = useApi<WatchResponse>('/api/watch');
  const [playing, setPlaying] = useState<WatchVideo | null>(null);
  const watched = new Set(api.data?.history.map((h) => h.videoKey) ?? []);

  return (
    <div className="pb-6" data-testid="watch-page">
      <PageHeader title="Video" subtitle="Videos from people near you" />
      <ul className="grid grid-cols-1 gap-3 px-4 sm:grid-cols-2 md:px-0 lg:grid-cols-3">
        {(api.data?.videos ?? []).map((v) => (
          <li key={v.key}>
            <button
              type="button"
              data-testid={`video-${v.key}`}
              onClick={() => setPlaying(v)}
              className="group flex w-full flex-col overflow-hidden rounded-card bg-fb-surface text-left shadow-card"
            >
              <span className="relative block aspect-video bg-fb-input">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.posterUrl} alt="" className="size-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="flex size-12 items-center justify-center rounded-full bg-black/60 text-white"><Play size={22} aria-hidden /></span>
                </span>
                <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 text-[12px] font-semibold text-white">{v.minutes}:00</span>
                {watched.has(v.key) && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-pill bg-black/70 px-2 py-0.5 text-[12px] text-white">
                    <Check size={12} aria-hidden /> Watched
                  </span>
                )}
              </span>
              <span className="flex gap-2 p-3">
                {v.creator && <Avatar src={v.creator.avatarUrl} name={v.creator.name} size={36} />}
                <span className="min-w-0">
                  <span className="line-clamp-2 text-[15px] font-semibold leading-5 text-fb-text">{v.title}</span>
                  <span className="block text-[13px] text-fb-text-2">{v.creator?.name ?? ''}</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {playing && <Player video={playing} onClose={() => { setPlaying(null); void api.refetch(); }} />}
    </div>
  );
}

function Player({ video, onClose }: { video: WatchVideo; onClose: () => void }) {
  const [sec, setSec] = useState(0);
  const [paused, setPaused] = useState(false);
  const [saved, setSaved] = useState(false);
  const recorded = useRef(0);

  useEffect(() => {
    if (paused || sec >= PREVIEW_SEC) return;
    const id = window.setTimeout(() => setSec((s) => Math.min(PREVIEW_SEC, s + 0.25)), 250);
    return () => window.clearTimeout(id);
  }, [sec, paused]);

  // Record what played: at the end of the preview, and on close for a partial play.
  const record = useCallback(async () => {
    const add = Math.floor(sec) - recorded.current;
    if (add < 1) return;
    recorded.current += add;
    try { await apiPost(`/api/watch/${video.key}/view`, { seconds: add }); setSaved(true); } catch { /* best effort */ }
  }, [sec, video.key]);
  useEffect(() => { if (sec >= PREVIEW_SEC) void record(); }, [sec, record]);
  const close = useCallback(() => { void record().finally(onClose); }, [record, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const done = sec >= PREVIEW_SEC;
  return (
    <div role="dialog" aria-modal="true" aria-label={video.title} data-testid="video-player" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-[720px] overflow-hidden rounded-card bg-[#18191A] text-white shadow-popover">
        <div className="relative aspect-video overflow-hidden bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={video.posterUrl}
            alt=""
            className="size-full object-cover motion-safe:transition-transform motion-safe:duration-[8000ms] motion-safe:ease-linear"
            style={{ transform: `scale(${1 + (sec / PREVIEW_SEC) * 0.08})` }}
          />
          <span className="absolute left-3 top-3 rounded bg-black/60 px-2 py-0.5 text-[12px]">Preview</span>
          <button type="button" aria-label="Close" onClick={close} className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-black/60 hover:bg-black/80">
            <X size={20} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={paused ? 'Play' : 'Pause'}
            onClick={() => setPaused((p) => !p)}
            className="absolute bottom-4 left-3 flex size-9 items-center justify-center rounded-full bg-black/60 hover:bg-black/80"
          >
            {paused ? <Play size={18} aria-hidden /> : <Pause size={18} aria-hidden />}
          </button>
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
            <div className="h-full bg-fb-blue transition-[width] duration-200 ease-linear" style={{ width: `${(sec / PREVIEW_SEC) * 100}%` }} />
          </div>
        </div>
        <div className="flex flex-col gap-2 p-4">
          <p className="text-[17px] font-semibold leading-[22px]">{video.title}</p>
          <p className="text-[13px] text-[#B0B3B8]">{video.creator?.name ?? ''} · {video.topics.join(' · ')}</p>
          <p
            data-testid="player-muse-note"
            className={cn('rounded-btn bg-white/10 px-3 py-2 text-[14px] leading-[19px] transition-opacity', done || saved ? 'opacity-100' : 'opacity-60')}
          >
            ✨ {done || saved
              ? <>Muse will use this for your Marketplace picks. <Link href="/marketplace" className="font-semibold text-[#4599FF] hover:underline">See picks</Link></>
              : 'Muse picks Marketplace items from what you watch.'}
          </p>
        </div>
      </div>
    </div>
  );
}
