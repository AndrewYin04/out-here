'use client';

// Compact horizontal strip of the journey's stops (places, not individual photos). Direct access
// to any moment without moving through the map. Keyboard: Left/Right move and select, Home/End
// jump. Scrolls horizontally on phones; stays one row however many stops there are.
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { cn } from '@/features/ui';
import { formatJourneyDay, formatStopTime, photoLabel, type JourneyStop } from './journey';

export type MemoryTimelineProps = {
  stops: JourneyStop[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  reducedMotion: boolean;
  className?: string;
};

export function MemoryTimeline({ stops, selectedId, onSelect, reducedMotion, className }: MemoryTimelineProps) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const multiDay = new Set(stops.map((s) => formatJourneyDay(s.startsAt))).size > 1;

  // Keep the selected stop in view without jumping the page.
  useEffect(() => {
    if (!selectedId) return;
    refs.current.get(selectedId)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [selectedId, reducedMotion]);

  const move = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = e.key === 'ArrowRight' ? index + 1 : e.key === 'ArrowLeft' ? index - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? stops.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const stop = stops[Math.max(0, Math.min(stops.length - 1, next))];
    onSelect(stop.id);
    refs.current.get(stop.id)?.focus();
  };

  return (
    <nav aria-label="Moments in this memory" className={className}>
      <ol className="flex gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:none]" data-testid="memory-timeline">
        {stops.map((s, i) => {
          const active = s.id === selectedId;
          const when = multiDay ? formatJourneyDay(s.startsAt) : formatStopTime(s.startsAt);
          return (
            <li key={s.id} className="shrink-0">
              <button
                ref={(el) => { if (el) refs.current.set(s.id, el); else refs.current.delete(s.id); }}
                type="button"
                onClick={() => onSelect(s.id)}
                onKeyDown={(e) => move(e, i)}
                tabIndex={active || (!selectedId && i === 0) ? 0 : -1}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex min-w-[112px] max-w-[180px] flex-col items-start rounded-card border bg-fb-surface px-3 py-2 text-left shadow-card',
                  'motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fb-blue',
                  active ? 'border-fb-blue bg-fb-blue-tint' : 'border-fb-divider-soft hover:bg-fb-bg',
                )}
                data-testid="memory-timeline-item"
              >
                <span className={cn('text-[13px] leading-4', active ? 'font-semibold text-fb-blue' : 'text-fb-text-2')}>
                  {s.emoji && <span aria-hidden className="mr-1">{s.emoji}</span>}
                  {when ?? `Stop ${i + 1}`}
                </span>
                <span className="mt-0.5 w-full truncate text-[15px] font-semibold leading-5 text-fb-text">{s.venueName ?? s.title}</span>
                <span className="text-[12px] leading-4 text-fb-text-2">{photoLabel(s.photos.length)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
