'use client';

// "Picked for you": the line under the I'm free sheet's "Up for" row. It shows Muse's one Decided
// sentence; "How?" opens the three steps behind the chips, one by one: Noticed (the viewer's own
// data), Checked (done by code: open plans nearby), Decided (Muse). Data: GET /api/muse/for-you.
import {
  Camera, ChevronDown, ChevronUp, CupSoda, Dices, Flower2, Guitar, Mountain, PenTool, PersonStanding, Shirt, Soup, Sprout, Volleyball,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn, Skeleton } from '@/features/ui';
import type { ForYouIcon, ForYouResponse } from '@/shared';
import { MuseLabel } from './SuggestionCard';

export const FOR_YOU_ICONS: Record<ForYouIcon, LucideIcon> = {
  dumplings: Soup, boba: CupSoda, music: Guitar, sketch: PenTool, thrift: Shirt, run: PersonStanding,
  climb: Mountain, volley: Volleyball, film: Camera, games: Dices, yoga: Flower2, plants: Sprout,
};

const STAGGER_MS = 220;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** Noticed: hollow blue ring. Checked: green dot. Decided: solid blue dot. */
function Marker({ kind }: { kind: 'noticed' | 'checked' | 'decided' }) {
  return (
    <span aria-hidden className={cn(
      'mt-[3px] size-3 shrink-0 rounded-full',
      kind === 'noticed' && 'border-[2.5px] border-fb-blue',
      kind === 'checked' && 'bg-fb-green',
      kind === 'decided' && 'bg-fb-blue',
    )} />
  );
}

function Step({ kind, title, shown, children }: { kind: 'noticed' | 'checked' | 'decided'; title: string; shown: boolean; children: React.ReactNode }) {
  return (
    <div data-step={kind} className={cn('flex gap-2 transition-[opacity,transform] duration-200', shown ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0')}>
      <Marker kind={kind} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-[18px] text-fb-text">{title}</p>
        {children}
      </div>
    </div>
  );
}

export function ForYouWhy({ data, loading }: { data: ForYouResponse | null; loading: boolean }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!open) return;
    if (prefersReducedMotion()) { setShown(3); return; }
    setShown(0);
    let n = 0;
    const id = window.setInterval(() => { n += 1; setShown(n); if (n >= 3) window.clearInterval(id); }, STAGGER_MS);
    return () => window.clearInterval(id);
  }, [open]);

  if (loading && !data) {
    return (
      <div className="mt-1 flex items-center gap-2 px-1" data-testid="for-you-loading">
        <MuseLabel />
        <span className="text-[13px] text-fb-text-2">Reading your hangouts and videos…</span>
        <Skeleton width={40} className="h-3" />
      </div>
    );
  }
  if (!data || data.chips.length === 0) return null;

  return (
    <div data-testid="for-you" className="mt-1 rounded-card bg-fb-bg px-3 py-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2 text-left">
        {data.byMuse && <MuseLabel className="mt-px shrink-0" />}
        <span className={cn('min-w-0 flex-1 text-[13px] leading-[18px] text-fb-text', !open && 'line-clamp-2')}>
          {open ? <span className="font-semibold">How Muse picked your first {data.chips.length}</span> : data.decided}
        </span>
        <span className="flex shrink-0 items-center text-[13px] font-semibold text-fb-blue">
          {open ? 'Hide' : 'How?'}{open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        </span>
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2.5 pb-1" data-testid="for-you-steps">
          <Step kind="noticed" title="Noticed" shown={shown >= 1}>
            <ul className="mt-0.5 flex flex-col gap-0.5">
              {data.noticed.map((n) => (
                <li key={n.text} className="text-[13px] leading-[18px] text-fb-text-2">• {n.text}</li>
              ))}
            </ul>
          </Step>
          <Step kind="checked" title="Checked" shown={shown >= 2}>
            <ul className="mt-0.5 flex flex-col gap-0.5">
              {data.checked.map((c) => <li key={c} className="text-[13px] leading-[18px] text-fb-text-2">• {c}</li>)}
            </ul>
          </Step>
          <Step kind="decided" title={data.byMuse ? 'Decided' : 'Picked'} shown={shown >= 3}>
            <p className="mt-0.5 text-[13px] leading-[18px] text-fb-text">{data.decided}</p>
          </Step>
        </div>
      )}
    </div>
  );
}
