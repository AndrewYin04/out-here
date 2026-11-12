'use client';

// Temporary stand-in for the 3D memory map. It implements the same MemoryMapProps a real map
// will, so swapping it (in ./mapSlot.ts) needs no UI changes. It shows the selected stop's real
// photo, name and time over a plain map-coloured backdrop. No geography, route or camera motion
// is drawn, because none of that exists yet.
import { useEffect, useState } from 'react';
import { ImageOff, MapPin } from 'lucide-react';
import { cn } from '@/features/ui';
import type { MemoryMapProps } from './mapContract';
import { formatStopTime } from './journey';

export function MemoryMapPreview({ points, selectedMemoryId, onSelectMemory, focusRequest, className }: MemoryMapProps) {
  const selected = points.find((p) => p.id === selectedMemoryId) ?? points[0] ?? null;
  const [broken, setBroken] = useState<string | null>(null);
  useEffect(() => setBroken(null), [selected?.photoUrl]);

  const time = formatStopTime(selected?.startsAt ?? null);
  const showPhoto = selected?.photoUrl && broken !== selected.photoUrl;

  return (
    <div
      className={cn('relative h-full w-full overflow-hidden bg-[#E8EEF2]', className)}
      data-testid="memory-map-preview"
      data-selected={selected?.id ?? ''}
    >
      {/* Plain block pattern for a map feel. Not a real place; nothing here is geographic. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'linear-gradient(#DCE4EA 2px, transparent 2px), linear-gradient(90deg, #DCE4EA 2px, transparent 2px)',
          backgroundSize: '56px 56px',
        }}
      />

      <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[12px] font-semibold text-fb-text-2 shadow-card">
        Map preview
      </span>

      {selected ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 pb-4">
          <button
            type="button"
            onClick={() => onSelectMemory(selected.id)}
            className="group flex flex-col items-center rounded-card focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-fb-blue"
            aria-label={`${selected.title}${time ? `, ${time}` : ''}. Open details`}
          >
            <span
              key={`${selected.id}-${focusRequest ?? 0}`}
              className="relative block w-[min(64vw,260px)] overflow-hidden rounded-[16px] border-4 border-white bg-fb-skeleton shadow-popover"
            >
              {showPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.photoUrl!}
                  alt=""
                  className="aspect-[4/3] w-full object-cover"
                  onError={() => setBroken(selected.photoUrl)}
                />
              ) : (
                <span className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 text-fb-text-2">
                  {selected.photoUrl ? <ImageOff size={28} aria-hidden /> : <span className="text-[40px]" aria-hidden>{selected.emoji ?? '📍'}</span>}
                  <span className="text-[13px]">{selected.photoUrl ? 'Photo unavailable' : 'No photos yet'}</span>
                </span>
              )}
              {selected.photoCount > 1 && (
                <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[12px] font-semibold text-white">
                  {selected.photoCount} photos
                </span>
              )}
            </span>
            <span aria-hidden className="-mt-1 h-3 w-3 rotate-45 bg-white shadow-card" />
            <span className="mt-2 flex h-9 w-9 items-center justify-center rounded-full bg-fb-blue text-white shadow-popover">
              {selected.emoji ? <span className="text-[18px]" aria-hidden>{selected.emoji}</span> : <MapPin size={18} aria-hidden />}
            </span>
            <span className="mt-2 rounded-card bg-white px-3 py-1.5 text-center shadow-card">
              <span className="block text-[15px] font-semibold text-fb-text">{selected.title}</span>
              <span className="block text-[13px] text-fb-text-2">
                {[time, selected.coordinates ? null : 'Location not recorded'].filter(Boolean).join(' · ') || ' '}
              </span>
            </span>
          </button>
        </div>
      ) : (
        <p className="absolute inset-0 flex items-center justify-center text-[15px] text-fb-text-2">No places in this memory yet.</p>
      )}
    </div>
  );
}
