'use client';
// Drag a bottom sheet by its handle (phones): up snaps it to full height, down returns it to half
// height or closes it from half. A quick flick counts even when the distance is short. The handle
// is a real button, so mouse, touch and keyboard all work: Enter or Space toggles half and full,
// ArrowUp expands, ArrowDown collapses (and closes from half). Under prefers-reduced-motion the
// snap is instant. The sheet opens where it always did; dragging is optional.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { reducedMotion } from './motion';

export type SheetSnap = 'half' | 'full';

const CLOSE_PX = 90;     // drag down this far from half to close
const SNAP_PX = 56;      // drag this far to change size
const FLICK = 0.55;      // px per ms

export function useSheetDrag({ onClose, initial = 'half' }: { onClose: () => void; initial?: SheetSnap }) {
  const [snap, setSnap] = useState<SheetSnap>(initial);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  // The open animation keeps its end transform (fill: both), which would override the drag. Once
  // the sheet has been touched, drop it (it has long finished, so nothing visible changes).
  const [touched, setTouched] = useState(false);
  // Read after mount: the server cannot know it, and both renders must match (hydration).
  const [reduce, setReduce] = useState(false);
  useEffect(() => setReduce(reducedMotion()), []);
  const start = useRef<{ y: number; t: number; id: number } | null>(null);
  // The two latest pointer samples: the flick speed is measured over the last move.
  const last = useRef<{ y: number; t: number }>({ y: 0, t: 0 });
  const prev = useRef<{ y: number; t: number }>({ y: 0, t: 0 });

  const settle = useCallback((dy: number, velocity: number) => {
    const down = dy > SNAP_PX || velocity > FLICK;
    const up = dy < -SNAP_PX || velocity < -FLICK;
    if (up) setSnap('full');
    else if (down) {
      if (snap === 'full') setSnap('half');
      else if (dy > CLOSE_PX || velocity > FLICK) onClose();
    }
    setDragY(0);
  }, [snap, onClose]);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    start.current = { y: e.clientY, t: e.timeStamp, id: e.pointerId };
    last.current = { y: e.clientY, t: e.timeStamp };
    prev.current = last.current;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setTouched(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    prev.current = last.current;
    last.current = { y: e.clientY, t: e.timeStamp };
    // Down follows the finger; up is resisted (the sheet grows on release, it does not detach).
    const dy = e.clientY - start.current.y;
    setDragY(dy > 0 ? dy : dy / 4);
  };
  const end = (e: PointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    setDragging(false);
    const dy = e.clientY - s.y;
    const from = e.clientY === last.current.y ? prev.current : last.current;
    const velocity = (e.clientY - from.y) / Math.max(8, e.timeStamp - from.t);
    // A tap (no movement) toggles, like the keyboard.
    if (Math.abs(dy) < 4) { setSnap((v) => (v === 'full' ? 'half' : 'full')); setDragY(0); return; }
    settle(dy, velocity);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); setSnap('full'); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (snap === 'full') setSnap('half'); else onClose(); }
  };

  /** Spread on the handle <button>. */
  const handleProps = {
    type: 'button' as const,
    'aria-label': snap === 'full' ? 'Collapse' : 'Expand',
    'aria-expanded': snap === 'full',
    onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end, onKeyDown,
    onClick: (e: { detail: number }) => { if (e.detail === 0) setSnap((v) => (v === 'full' ? 'half' : 'full')); }, // keyboard Enter/Space
  };
  /** Spread on the sheet: follows the finger while dragging, eases to the snap after. */
  const sheetStyle: CSSProperties = {
    transform: dragY ? `translateY(${dragY}px)` : undefined,
    transition: dragging || reduce ? 'none' : 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1), max-height 240ms cubic-bezier(0.22, 1, 0.36, 1)',
    touchAction: dragging ? 'none' : undefined,
    animation: touched ? 'none' : undefined,
  };
  /** Back to how the sheet opens (for sheets that stay mounted while closed). */
  const reset = useCallback(() => { setSnap(initial); setTouched(false); setDragY(0); setDragging(false); start.current = null; }, [initial]);
  return { snap, setSnap, dragging, handleProps, sheetStyle, reset };
}
