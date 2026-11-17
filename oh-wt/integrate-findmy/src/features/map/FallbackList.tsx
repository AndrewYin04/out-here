'use client';
// Shown instead of the map when the browser has no WebGL: the same quests as a list.
import type { Quest } from '@/shared';
import { seatBadge, seatsLeftOf, startsLabel, walkLabel } from './format';

export type FallbackListProps = {
  quests: Quest[];
  walkMinutes: Record<string, number>;
  now: Date;
  onSelect: (id: string) => void;
  testIdFor: (id: string) => string;
};

export function FallbackList({ quests, walkMinutes, now, onSelect, testIdFor }: FallbackListProps) {
  return (
    <div className="absolute inset-0 overflow-y-auto bg-fb-bg px-4 pb-24 pt-16" data-testid="map-fallback">
      <div className="mx-auto max-w-[680px] rounded-card bg-fb-surface p-2 shadow-card">
        <h2 className="px-2 pt-2 text-[17px] font-bold">Plans near Menlo Park</h2>
        <p className="px-2 pb-2 text-fb-meta text-fb-text-2">The map can&apos;t load on this device, so here&apos;s the list.</p>
        {quests.length === 0 && <p className="px-2 py-4 text-fb-body text-fb-text-2">No plans right now.</p>}
        <ul>
          {quests.map((q) => {
            const walk = walkLabel(walkMinutes[q.id]);
            return (
              <li key={q.id}>
                <button
                  type="button"
                  data-testid={testIdFor(q.id)}
                  onClick={() => onSelect(q.id)}
                  className="flex w-full items-center gap-3 rounded-btn p-2 text-left hover:bg-fb-hover"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fb-input text-[22px]" aria-hidden>{q.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-fb-body font-semibold">{q.title}</span>
                    <span className="block truncate text-fb-meta text-fb-text-2">
                      {q.venueName} · {startsLabel(q, now)}{walk ? ` · ${walk}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-pill bg-fb-blue px-2 py-0.5 text-[12px] font-bold text-white">{seatBadge(seatsLeftOf(q))}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
