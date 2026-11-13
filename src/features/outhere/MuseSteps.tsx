'use client';

import { Check, ChevronDown, ChevronUp, Loader2, Minus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/features/ui';
import { LOADING_STEPS, type MuseStep } from './muse-steps';
import { MuseLabel } from './SuggestionCard';

const DONE_STAGGER_MS = 150;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * A single honest pending status: backend stages are only shown after actual results.
 * `steps` defaults to the plan's steps; other Muse helpers pass their own.
 */
export function MuseStepsLoading({ steps = LOADING_STEPS, className }: { steps?: readonly string[]; className?: string } = {}) {
  return (
    <div data-testid="muse-steps-loading" role="status" className={cn('mb-2 flex items-center gap-2 rounded-card bg-fb-surface p-3 shadow-card', className)}>
      <Loader2 size={16} className="shrink-0 text-fb-blue motion-safe:animate-spin" aria-hidden />
      <p className="text-[14px] text-fb-text">{steps===LOADING_STEPS?'Muse is finding plans that fit…':'Muse is working on your request…'}</p>
    </div>
  );
}

/** After the plan returns: the real steps, staggered in, with a Hide/Show toggle. */
export function MuseStepsDone({ steps, showMuse }: { steps: MuseStep[]; showMuse: boolean }) {
  // Collapsed by default: one tap-to-open row, so the suggestions stay the focus.
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? steps.length : 0));

  useEffect(() => {
    if (!open) return;
    if (prefersReducedMotion()) { setShown(steps.length); return; }
    setShown(0);
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      setShown(n);
      if (n >= steps.length) window.clearInterval(id);
    }, DONE_STAGGER_MS);
    return () => window.clearInterval(id);
  }, [steps, open]);

  return (
    <div data-testid="muse-steps" className="mb-3 rounded-card bg-fb-surface px-3 py-2 shadow-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 py-0.5 text-left"
      >
        <span className="flex items-center gap-2">
          {showMuse && <MuseLabel />}
          <span className="text-[13px] font-semibold text-fb-text">How Muse picked these</span>
        </span>
        <span className="flex items-center gap-0.5 text-[13px] text-fb-text-2">
          {open ? 'Hide' : 'Show'}
          {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        </span>
      </button>
      {open && (
        <ul className="mt-1.5 flex flex-col gap-1">
          {steps.map((s, i) => (
            <li
              key={s.key}
              data-step={s.key}
              className={cn(
                'flex items-start gap-2 text-[13px] leading-[18px] transition-[opacity,transform] duration-200',
                s.tone === 'ok' ? 'text-fb-text' : 'text-fb-text-2',
                i < shown ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
              )}
            >
              {s.tone === 'ok'
                ? <Check size={14} className="mt-0.5 shrink-0 text-fb-green" aria-hidden />
                : <Minus size={14} className="mt-0.5 shrink-0 text-fb-text-2" aria-hidden />}
              <span>{s.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
