'use client';

import { Check, ChevronDown, ChevronUp, Loader2, Minus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/features/ui';
import { LOADING_STEPS, type MuseStep } from './muse-steps';
import { MuseLabel } from './SuggestionCard';

const LOADING_STEP_MS = 600;
const DONE_STAGGER_MS = 150;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * While a Muse request runs: generic step names appear one by one. No results are claimed.
 * `steps` defaults to the plan's steps; other Muse helpers pass their own.
 */
export function MuseStepsLoading({ steps = LOADING_STEPS, className }: { steps?: readonly string[]; className?: string } = {}) {
  const [shown, setShown] = useState(1);
  useEffect(() => {
    const id = window.setInterval(() => {
      setShown((n) => (n >= steps.length ? n : n + 1));
    }, LOADING_STEP_MS);
    return () => window.clearInterval(id);
  }, [steps.length]);

  return (
    <div data-testid="muse-steps-loading" className={cn('mb-2 rounded-card bg-fb-surface p-3 shadow-card', className)}>
      <p className="mb-1.5 text-[15px] font-semibold text-fb-text">✨ Muse is working</p>
      <ul className="flex flex-col gap-1">
        {steps.slice(0, shown).map((label, i) => {
          const current = i === shown - 1;
          return (
            <li key={label} className={cn('flex items-center gap-2 text-[13px]', current ? 'text-fb-text' : 'text-fb-text-2')}>
              {current
                ? <Loader2 size={14} className="shrink-0 animate-spin text-fb-blue" aria-hidden />
                : <span className="mx-[5px] size-1 shrink-0 rounded-full bg-fb-text-2" aria-hidden />}
              {label}
            </li>
          );
        })}
      </ul>
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
          {showMuse ? <MuseLabel /> : <span aria-hidden>✨</span>}
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
                'flex items-start gap-2 text-[13px] leading-[18px] transition-all duration-200',
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
