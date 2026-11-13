'use client';
// "Post a plan" step 0: pick a spot. The map stays live (pan, zoom), the mouse becomes a pin
// with a ＋ and a pulsing ring, and a click (or a tap, or a long-press) opens the host picker
// right there. Esc or Cancel leaves the mode. Built in CSS, no image asset.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { LatLng } from '@/shared';

/** The pointer pin: its tip sits on the spot, so the drawing hangs above the pointer. */
function PinCursor({ pressing }: { pressing: boolean }) {
  return (
    <span className="relative block size-0" aria-hidden>
      {/* Pulsing ring on the spot itself. */}
      <span className="oh-place-ring absolute -left-5 -top-5 size-10 rounded-full border-2 border-fb-blue" />
      <span className={`absolute -left-[5px] -top-[5px] size-[10px] rounded-full bg-fb-blue shadow-[0_0_0_2px_white] transition-transform ${pressing ? 'scale-150' : ''}`} />
      {/* The pin: a blue drop with a white ＋, tip at the spot. */}
      <span className={`absolute -left-[18px] -top-[50px] flex size-9 rotate-45 items-center justify-center rounded-[50%_50%_0_50%] bg-fb-blue shadow-popover transition-transform duration-150 ${pressing ? 'translate-y-1' : 'oh-place-bob'}`}>
        <Plus size={20} strokeWidth={3} className="-rotate-45 text-white" />
      </span>
    </span>
  );
}

export function PlaceMode({ map, onPick, onCancel }: {
  map: MapLibreMap;
  onPick: (at: LatLng) => void;
  onCancel: () => void;
}) {
  const [pt, setPt] = useState<{ x: number; y: number } | null>(null);
  const [pressing, setPressing] = useState(false);
  const [coarse, setCoarse] = useState(false);
  const pick = useRef(onPick);
  const cancel = useRef(onCancel);
  useEffect(() => { pick.current = onPick; cancel.current = onCancel; });

  useEffect(() => {
    setCoarse(window.matchMedia?.('(pointer: coarse)').matches ?? false);
    const box = map.getCanvasContainer();
    box.setAttribute('data-placing', '');
    // A click or tap on the map itself (markers stop their own clicks). A drag is a pan, and
    // MapLibre doesn't fire click for it.
    const click = (e: { lngLat: { lat: number; lng: number } }) => pick.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    map.on('click', click);
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const r = box.getBoundingClientRect();
      setPt({ x: e.clientX - r.left, y: e.clientY - r.top });
    };
    const leave = () => setPt(null);
    const down = (e: PointerEvent) => { if (e.pointerType === 'mouse') setPressing(true); };
    const up = () => setPressing(false);
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerleave', leave);
    box.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel.current(); };
    window.addEventListener('keydown', onKey);
    return () => {
      box.removeAttribute('data-placing');
      map.off('click', click);
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerleave', leave);
      box.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', onKey);
    };
  }, [map]);

  return (
    <>
      <style>{`
        [data-placing], [data-placing] .maplibregl-canvas { cursor: none !important; }
        .oh-place-ring { animation: oh-place-ring 1.4s cubic-bezier(0, 0, 0.2, 1) infinite; }
        .oh-place-bob { animation: oh-place-bob 1.4s ease-in-out infinite; }
        @keyframes oh-place-ring { 0% { transform: scale(0.35); opacity: 0.9; } 100% { transform: scale(1.6); opacity: 0; } }
        @keyframes oh-place-bob { 0%, 100% { translate: 0 0; } 50% { translate: 0 -3px; } }
        @media (prefers-reduced-motion: reduce) { .oh-place-ring, .oh-place-bob { animation: none; } }
      `}</style>
      {pt && (
        <div data-testid="place-cursor" className="pointer-events-none absolute left-0 top-0 z-[25]" style={{ transform: `translate(${pt.x}px, ${pt.y}px)` }}>
          <PinCursor pressing={pressing} />
        </div>
      )}
      {/* On touch there is no pointer to follow: a pin pulses in the middle as the example. */}
      {coarse && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[25] opacity-80">
          <PinCursor pressing={false} />
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-[26] flex justify-center px-4 max-md:bottom-20">
        <div role="status" data-testid="place-hint"
          className="pointer-events-auto flex animate-pop-in items-center gap-2 rounded-pill bg-fb-surface py-1.5 pl-4 pr-1.5 text-[15px] font-semibold text-fb-text shadow-popover">
          <span aria-hidden>📍</span>
          <span className="whitespace-nowrap">{coarse ? 'Tap or hold to host here' : 'Click or hold anywhere to host here'}</span>
          <button type="button" data-testid="place-cancel" onClick={onCancel}
            className="oh-press flex h-8 items-center gap-1 rounded-pill bg-fb-hover px-3 text-[14px] font-semibold text-fb-text hover:bg-fb-divider-soft">
            <X size={16} aria-hidden />Cancel
          </button>
        </div>
      </div>
    </>
  );
}
