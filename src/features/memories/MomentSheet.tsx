'use client';

// The selected stop's details over the journey. Collapsed: a compact row (title, time, preview)
// that leaves the map visible. Expanded: the real photos, who was there, the caption, verified
// details and "Do it again". Buttons for everything (no gesture-only controls); Escape collapses.
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ImageOff, X } from 'lucide-react';
import type { PersonCard } from '@/shared';
import { LookAvatarStack } from '@/features/avatar';
import { cn, IconButton } from '@/features/ui';
import { formatJourneyDay, formatStopTime, type JourneyStop } from './journey';
import { RegroupPanel } from './RegroupPanel';
import type { RegroupState } from './useRegroup';

export type SheetMode = 'collapsed' | 'expanded';

export type MomentSheetProps = {
  stop: JourneyStop;
  stopIndex: number;
  stopCount: number;
  photoIndex: number;
  onPhotoIndex: (i: number) => void;
  mode: SheetMode;
  onMode: (mode: SheetMode) => void;
  onDismiss: () => void;
  onStep: (delta: -1 | 1) => void;
  /** Crew members (fallback when the stop has no people of its own). */
  crewMembers: PersonCard[];
  regroup: RegroupState;
  regroupSublabel: string;
  reducedMotion: boolean;
};

export function MomentSheet(p: MomentSheetProps) {
  const { stop, mode } = p;
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const people = stop.people.length > 0 ? stop.people : p.crewMembers;
  const photo = stop.photos[p.photoIndex] ?? null;
  const time = [formatStopTime(stop.startsAt), formatJourneyDay(stop.startsAt)].filter(Boolean).join(' · ');

  // Move focus into the sheet when it opens so keyboard users land on the content.
  useEffect(() => {
    if (mode === 'expanded') heading.current?.focus();
  }, [mode]);

  // Escape collapses the expanded sheet wherever focus is (a button that disables itself while
  // Muse works drops focus to <body>, so a listener on the sheet alone would miss it).
  const { onMode } = p;
  useEffect(() => {
    if (mode !== 'expanded') return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onMode('collapsed');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode, onMode]);

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-[16px] bg-fb-surface shadow-popover md:inset-x-3 md:bottom-3 md:rounded-card',
        mode === 'expanded' ? 'max-h-[82%]' : 'max-h-[96px]',
        !p.reducedMotion && 'motion-safe:transition-[max-height] motion-safe:duration-200 motion-safe:ease-out',
      )}
      data-testid="moment-sheet"
      data-mode={mode}
    >
      <div className="flex items-center gap-3 px-3 pb-2 pt-3">
        <button
          type="button"
          onClick={() => p.onMode(mode === 'expanded' ? 'collapsed' : 'expanded')}
          aria-expanded={mode === 'expanded'}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-card text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fb-blue"
          data-testid="moment-sheet-toggle"
        >
          {mode === 'collapsed' && (
            <Thumb url={stop.photos[0]?.photoUrl ?? null} emoji={stop.emoji} />
          )}
          <span className="min-w-0 flex-1">
            <h2 id={headingId} ref={heading} tabIndex={-1} className="truncate text-[17px] font-semibold leading-[22px] text-fb-text outline-none">
              {stop.venueName ?? stop.title}
            </h2>
            <span className="block truncate text-[13px] text-fb-text-2">
              {[time || null, p.stopCount > 1 ? `Stop ${p.stopIndex + 1} of ${p.stopCount}` : null].filter(Boolean).join(' · ') || stop.title}
            </span>
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fb-secondary-btn text-fb-text" aria-hidden>
            {mode === 'expanded' ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
          </span>
          <span className="sr-only">{mode === 'expanded' ? 'Collapse details' : 'Expand details'}</span>
        </button>
        <IconButton label="Close details" onClick={p.onDismiss}><X size={20} aria-hidden /></IconButton>
      </div>

      {mode === 'expanded' && (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4" data-testid="moment-sheet-body">
          <PhotoViewer stop={stop} index={p.photoIndex} onIndex={p.onPhotoIndex} />

          {photo?.caption && <p className="mt-3 text-[15px] text-fb-text">&ldquo;{photo.caption}&rdquo;</p>}

          <dl className="mt-3 grid gap-2 text-[15px] text-fb-text">
            {people.length > 0 && (
              <div className="flex items-center gap-2">
                <dt className="sr-only">Who was there</dt>
                <dd className="flex min-w-0 items-center gap-2">
                  <LookAvatarStack people={people} size={28} max={6} />
                  <span className="truncate">{people.map((m) => m.name.split(' ')[0]).join(', ')}</span>
                </dd>
              </div>
            )}
            {stop.venueName && stop.venueName !== stop.title && (
              <div className="flex gap-2"><dt className="text-fb-text-2">Plan</dt><dd>{stop.emoji ? `${stop.emoji} ` : ''}{stop.title}</dd></div>
            )}
            {stop.startsAt && (
              <div className="flex gap-2">
                <dt className="text-fb-text-2">When</dt>
                <dd>{[formatJourneyDay(stop.startsAt), [formatStopTime(stop.startsAt), formatStopTime(stop.endsAt)].filter(Boolean).join('–')].filter(Boolean).join(', ')}</dd>
              </div>
            )}
            {stop.priceMax !== null && (
              <div className="flex gap-2"><dt className="text-fb-text-2">Budget</dt><dd>Up to ${stop.priceMax}</dd></div>
            )}
          </dl>

          {p.stopCount > 1 && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <StepButton dir={-1} disabled={p.stopIndex === 0} onClick={() => p.onStep(-1)} />
              <StepButton dir={1} disabled={p.stopIndex === p.stopCount - 1} onClick={() => p.onStep(1)} />
            </div>
          )}

          <div className="mt-4 border-t border-fb-divider-soft pt-4">
            <RegroupPanel state={p.regroup} label="Do it again" sublabel={p.regroupSublabel} />
          </div>
        </div>
      )}
    </section>
  );
}

function Thumb({ url, emoji }: { url: string | null; emoji: string | null }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-fb-bg">
      {url && !broken
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setBroken(true)} />
        : <span className="text-[24px]" aria-hidden>{emoji ?? '📍'}</span>}
    </span>
  );
}

function PhotoViewer({ stop, index, onIndex }: { stop: JourneyStop; index: number; onIndex: (i: number) => void }) {
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const photo = stop.photos[index] ?? null;
  const n = stop.photos.length;
  if (!photo) {
    return <p className="rounded-card bg-fb-bg p-6 text-center text-[15px] text-fb-text-2">No photos from this stop yet.</p>;
  }
  const failed = broken.has(photo.photoUrl);
  return (
    <figure className="relative overflow-hidden rounded-card bg-fb-bg" data-testid="moment-photo">
      {failed ? (
        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-1 text-fb-text-2">
          <ImageOff size={28} aria-hidden /><span className="text-[13px]">Photo unavailable</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.photoUrl}
          alt={photo.caption || `${stop.venueName ?? stop.title} photo ${index + 1}`}
          className="aspect-[4/3] w-full object-cover"
          onError={() => setBroken((s) => new Set(s).add(photo.photoUrl))}
        />
      )}
      {n > 1 && (
        <>
          <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[12px] font-semibold text-white" aria-live="polite">
            {index + 1} of {n}
          </span>
          <div className="absolute inset-y-0 left-1 flex items-center">
            <IconButton label="Previous photo" disabled={index === 0} onClick={() => onIndex(index - 1)} className="bg-white/90 shadow-card disabled:opacity-0">
              <ChevronLeft size={20} aria-hidden />
            </IconButton>
          </div>
          <div className="absolute inset-y-0 right-1 flex items-center">
            <IconButton label="Next photo" disabled={index === n - 1} onClick={() => onIndex(index + 1)} className="bg-white/90 shadow-card disabled:opacity-0">
              <ChevronRight size={20} aria-hidden />
            </IconButton>
          </div>
        </>
      )}
    </figure>
  );
}

function StepButton({ dir, disabled, onClick }: { dir: -1 | 1; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 rounded-btn px-2 py-1.5 text-[15px] font-semibold text-fb-blue hover:bg-fb-hover disabled:text-fb-text-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-fb-blue"
    >
      {dir === -1 && <ChevronLeft size={18} aria-hidden />}
      {dir === -1 ? 'Previous stop' : 'Next stop'}
      {dir === 1 && <ChevronRight size={18} aria-hidden />}
    </button>
  );
}
