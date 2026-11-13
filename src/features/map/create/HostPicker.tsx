'use client';
// Long-press the map: six things to host fan out around your finger, and Muse asks "Host here?".
// Picking one starts the plan from it; the middle ＋ starts a blank one; tapping anywhere else
// cancels. Placed with map.project, so it sits exactly where you pressed.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { LatLng } from '@/shared';
import { HOST_PRESETS, type HostPreset } from './CreatePlanSheet';

const RADIUS = 82;

export function HostPicker({ map, at, onPick, onCancel }: {
  map: MapLibreMap;
  at: LatLng;
  onPick: (preset: HostPreset | null) => void;
  onCancel: () => void;
}) {
  const [pt, setPt] = useState(() => map.project([at.lng, at.lat]));
  useEffect(() => {
    const move = () => setPt(map.project([at.lng, at.lat]));
    map.on('move', move);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => { map.off('move', move); window.removeEventListener('keydown', onKey); };
  }, [map, at, onCancel]);

  return (
    <div className="absolute inset-0 z-30" data-testid="host-picker">
      <button type="button" aria-label="Cancel" className="absolute inset-0 cursor-default bg-black/10" onClick={onCancel} />
      <div className="pointer-events-none absolute" style={{ left: pt.x, top: pt.y }}>
        {HOST_PRESETS.map((p, i) => {
          const a = (-90 + (i * 360) / HOST_PRESETS.length) * (Math.PI / 180);
          return (
            <button
              key={p.key}
              type="button"
              data-testid={`host-pick-${p.key}`}
              aria-label={`Host: ${p.title}`}
              title={p.title}
              onClick={() => onPick(p)}
              className="pointer-events-auto absolute flex size-14 -translate-x-1/2 -translate-y-1/2 animate-pop-in items-center justify-center rounded-full bg-fb-surface text-[28px] shadow-popover transition-transform hover:scale-110"
              style={{ left: Math.cos(a) * RADIUS, top: Math.sin(a) * RADIUS, animationDelay: `${i * 40}ms` }}
            >
              {p.emoji}
            </button>
          );
        })}
        <button type="button" data-testid="host-pick-custom" aria-label="Host something else" onClick={() => onPick(null)}
          className="pointer-events-auto absolute flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-dashed border-fb-blue bg-fb-surface/90 text-fb-blue shadow-popover">
          <Plus size={26} aria-hidden />
        </button>
        <p className="absolute left-14 top-24 animate-pop-in whitespace-nowrap rounded-[16px] bg-fb-surface px-3 py-1.5 text-[14px] font-semibold text-fb-text shadow-popover" style={{ animationDelay: '220ms' }}>
          Host here? <span aria-hidden>✨</span>
        </p>
      </div>
    </div>
  );
}
