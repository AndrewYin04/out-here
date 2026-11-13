'use client';
// Watch: the fictional video catalogue (src/shared/seed/videos.json) as a grid. Each video is a
// short clip made from Muse-generated images (scripts/gen-clips.mjs); the player plays it and
// records the seconds actually watched. Muse reads that history for Marketplace picks, so the
// player says so and links there.
import { Check, Pause, Play, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiPost, useApi } from '@/features/data';
import { Avatar, cn } from '@/features/ui';
import type { WatchResponse, WatchVideo } from '@/shared/api';
import { PageHeader } from '../shell';

/** A view is recorded once this much has played (or the whole clip, if shorter). */
const MIN_RECORD_SEC = 6;

export function WatchPage() {
  const api = useApi<WatchResponse>('/api/watch');
  const [playing, setPlaying] = useState<WatchVideo | null>(null);
  const watched = new Set(api.data?.history.map((h) => h.videoKey) ?? []);

  return (
    <div className="pb-6" data-testid="watch-page">
      <PageHeader title="Video" subtitle={<>Short clips from people near you · <span aria-hidden>✨</span> made with Muse Image</>} />
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
  const ref = useRef<HTMLVideoElement>(null);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [saved, setSaved] = useState(false);
  // Seconds actually played (measured while playing), and how many are already recorded.
  const watched = useRef(0);
  const recorded = useRef(0);

  const record = useCallback(async () => {
    const add = Math.floor(watched.current) - recorded.current;
    if (add < 1) return;
    recorded.current += add;
    try { await apiPost(`/api/watch/${video.key}/view`, { seconds: add }); setSaved(true); } catch { /* best effort */ }
  }, [video.key]);

  // React does not reflect `muted` as an attribute, so autoplay can be blocked: set it and play.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = true;
    el.play().catch(() => setPaused(true));
  }, [video.clipUrl]);

  // Count real play time; record once the clip has played through.
  useEffect(() => {
    let last = performance.now();
    const id = window.setInterval(() => {
      const el = ref.current;
      const t = performance.now();
      if (el && !el.paused && !el.ended && el.readyState >= 2) watched.current += (t - last) / 1000;
      last = t;
      if (el?.duration) setProgress(el.currentTime / el.duration);
      if (el?.duration && watched.current >= Math.min(MIN_RECORD_SEC, el.duration - 0.3) && recorded.current === 0) void record();
    }, 250);
    return () => window.clearInterval(id);
  }, [record]);

  const close = useCallback(() => { void record().finally(onClose); }, [record, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) { void el.play(); setPaused(false); } else { el.pause(); setPaused(true); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={video.title} data-testid="video-player" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-[720px] overflow-hidden rounded-card bg-[#18191A] text-white shadow-popover">
        <div className="relative aspect-video overflow-hidden bg-black">
          <video
            ref={ref}
            src={video.clipUrl}
            poster={video.posterUrl}
            autoPlay
            muted
            loop
            playsInline
            className="size-full object-cover"
          />
          <span className="absolute left-3 top-3 rounded bg-black/60 px-2 py-0.5 text-[12px]">✨ Made with Muse Image</span>
          <button type="button" aria-label="Close" onClick={close} className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-black/60 hover:bg-black/80">
            <X size={20} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={paused ? 'Play' : 'Pause'}
            onClick={toggle}
            className="absolute bottom-4 left-3 flex size-9 items-center justify-center rounded-full bg-black/60 hover:bg-black/80"
          >
            {paused ? <Play size={18} aria-hidden /> : <Pause size={18} aria-hidden />}
          </button>
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
            <div className="h-full bg-fb-blue transition-[width] duration-200 ease-linear" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        <div className="flex flex-col gap-2 p-4">
          <p className="text-[17px] font-semibold leading-[22px]">{video.title}</p>
          <p className="text-[13px] text-[#B0B3B8]">{video.creator?.name ?? ''} · {video.topics.join(' · ')}</p>
          <p
            data-testid="player-muse-note"
            className={cn('rounded-btn bg-white/10 px-3 py-2 text-[14px] leading-[19px] transition-opacity', saved ? 'opacity-100' : 'opacity-60')}
          >
            ✨ {saved
              ? <>Muse will use this for your Marketplace picks. <Link href="/marketplace" className="font-semibold text-[#4599FF] hover:underline">See picks</Link></>
              : 'Muse picks Marketplace items from what you watch.'}
          </p>
        </div>
      </div>
    </div>
  );
}
