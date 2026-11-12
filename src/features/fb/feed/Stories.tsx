'use client';

import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { StoryGroup } from '@/shared/api';
import { useApi } from '@/features/data';
import { Avatar, Skeleton, SkeletonGroup, cn, useMounted } from '@/features/ui';
import { shortTime } from './format';

const STORY_MS = 5000;

export function StoriesTray() {
  const { data, loading, error } = useApi<{ stories: StoryGroup[] }>('/api/stories');
  const [openAt, setOpenAt] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const groups = (data?.stories ?? []).filter((g) => g.stories.length > 0);

  const updateArrows = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setCanScroll({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    updateArrows();
    window.addEventListener('resize', updateArrows);
    return () => window.removeEventListener('resize', updateArrows);
  }, [updateArrows, groups.length]);

  if (loading && !data) {
    return (
      <SkeletonGroup label="stories" className="flex gap-2 overflow-hidden px-4 py-3 md:px-0 md:py-0">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} shape="block" className="h-[170px] w-[96px] shrink-0 rounded-[10px] md:h-[160px] md:w-[110px]" />
        ))}
      </SkeletonGroup>
    );
  }
  if (error || groups.length === 0) return null;

  const scrollBy = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * 360, behavior: 'smooth' });

  return (
    <section aria-label="Stories" className="relative" data-testid="stories-tray">
      <div
        ref={scroller}
        onScroll={updateArrows}
        className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] md:px-0 md:py-0 [&::-webkit-scrollbar]:hidden"
      >
        {groups.map((g, i) => {
          const cover = g.stories[g.stories.length - 1];
          return (
            <button
              key={g.author.id}
              type="button"
              onClick={() => setOpenAt(i)}
              aria-label={`${g.author.name}'s story`}
              data-testid="story-card"
              className="group relative h-[170px] w-[96px] shrink-0 overflow-hidden rounded-[10px] bg-fb-skeleton shadow-card md:h-[160px] md:w-[110px]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover.mediaUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" />
              <span className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" aria-hidden />
              <span className={cn('absolute left-2 top-2 flex rounded-full bg-white p-[2px] ring-[3px]', g.seen ? 'ring-fb-divider' : 'ring-fb-blue')}>
                <Avatar name={g.author.name} src={g.author.avatarUrl} size={32} decorative />
              </span>
              <span className="absolute inset-x-2 bottom-2 line-clamp-2 text-left text-[13px] font-semibold leading-4 text-white">
                {g.author.name}
              </span>
            </button>
          );
        })}
      </div>
      {canScroll.left && (
        <button
          type="button"
          aria-label="Previous stories"
          onClick={() => scrollBy(-1)}
          className="absolute left-2 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-fb-surface text-fb-text-2 shadow-popover hover:bg-[#f2f2f2] md:flex"
        >
          <ChevronLeft size={24} aria-hidden />
        </button>
      )}
      {canScroll.right && (
        <button
          type="button"
          aria-label="Next stories"
          onClick={() => scrollBy(1)}
          className="absolute right-2 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-fb-surface text-fb-text-2 shadow-popover hover:bg-[#f2f2f2] md:flex"
        >
          <ChevronRight size={24} aria-hidden />
        </button>
      )}
      {openAt !== null && <StoryViewer groups={groups} start={openAt} onClose={() => setOpenAt(null)} />}
    </section>
  );
}

/** Full-screen story viewer: progress bars, auto-advance, tap or arrows for previous/next. */
export function StoryViewer({ groups, start, onClose }: { groups: StoryGroup[]; start: number; onClose: () => void }) {
  const mounted = useMounted();
  const [g, setG] = useState(start);
  const [s, setS] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const group = groups[g];
  const story = group?.stories[s];

  const next = useCallback(() => {
    setProgress(0);
    if (!group) return;
    if (s < group.stories.length - 1) setS(s + 1);
    else if (g < groups.length - 1) { setG(g + 1); setS(0); }
    else onClose();
  }, [g, s, group, groups.length, onClose]);

  const prev = useCallback(() => {
    setProgress(0);
    if (s > 0) setS(s - 1);
    else if (g > 0) { setG(g - 1); setS(groups[g - 1].stories.length - 1); }
  }, [g, s, groups]);

  // Auto-advance. Progress is tracked in state so pausing keeps the position.
  useEffect(() => {
    if (paused) return;
    const step = 50;
    const t = setInterval(() => setProgress((p) => Math.min(1, p + step / STORY_MS)), step);
    return () => clearInterval(t);
  }, [paused, g, s]);
  useEffect(() => { if (progress >= 1) next(); }, [progress, next]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [next, prev, onClose]);

  if (!mounted || !group || !story) return null;
  const atStart = g === 0 && s === 0;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${group.author.name}'s story`} data-testid="story-viewer" className="fixed inset-0 z-[80] flex items-center justify-center bg-[#1c1c1d]">
      <button type="button" onClick={onClose} aria-label="Close story" className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 md:left-4 md:right-auto">
        <X size={24} aria-hidden />
      </button>
      {!atStart && (
        <button type="button" onClick={prev} aria-label="Previous story" className="absolute left-[calc(50%-310px)] z-20 hidden h-12 w-12 items-center justify-center rounded-full bg-white/90 text-fb-text hover:bg-white md:flex">
          <ChevronLeft size={28} aria-hidden />
        </button>
      )}
      <button type="button" onClick={next} aria-label="Next story" className="absolute right-[calc(50%-310px)] z-20 hidden h-12 w-12 items-center justify-center rounded-full bg-white/90 text-fb-text hover:bg-white md:flex">
        <ChevronRight size={28} aria-hidden />
      </button>
      <div className="relative h-full w-full overflow-hidden bg-black md:h-[calc(100vh-32px)] md:max-h-[840px] md:w-auto md:aspect-[9/16] md:rounded-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={story.mediaUrl} alt={`Story from ${group.author.name}`} className="absolute inset-0 h-full w-full object-cover" />
        <span className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent" aria-hidden />
        <div className="absolute inset-x-3 top-3 z-10 flex gap-1" aria-hidden>
          {group.stories.map((st, i) => (
            <span key={st.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/40">
              <span
                data-testid={i === s ? 'story-progress-active' : undefined}
                className="block h-full bg-white"
                style={{ width: `${i < s ? 100 : i === s ? progress * 100 : 0}%` }}
              />
            </span>
          ))}
        </div>
        <div className="absolute inset-x-3 top-6 z-10 flex items-center gap-2 pr-12 md:pr-0">
          <Avatar name={group.author.name} src={group.author.avatarUrl} size={40} decorative />
          <span className="text-[15px] font-semibold text-white" data-testid="story-author">{group.author.name}</span>
          <span className="text-[13px] text-white/80">{shortTime(story.createdAt)}</span>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Play' : 'Pause'}
            className="ml-auto flex h-8 w-8 items-center justify-center text-white"
          >
            {paused ? <Play size={20} aria-hidden /> : <Pause size={20} aria-hidden />}
          </button>
        </div>
        {/* Tap zones (phone): left third goes back, the rest goes forward. */}
        <button type="button" aria-label="Previous story" tabIndex={-1} onClick={prev} className="absolute bottom-0 left-0 top-20 w-1/3 md:hidden" />
        <button type="button" aria-label="Next story" tabIndex={-1} onClick={next} className="absolute bottom-0 right-0 top-20 w-2/3 md:hidden" />
      </div>
    </div>,
    document.body,
  );
}
