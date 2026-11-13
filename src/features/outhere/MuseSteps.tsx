'use client';

import { Check, ChevronDown, ChevronUp, Loader2, Minus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/features/ui';
import { LOADING_STEPS, type MuseStep } from './muse-steps';
import type { MuseWork } from './muse-work';
import type { RuledOutRow } from './dropped';
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
    <div data-testid="muse-steps-loading" className={cn('mb-2 animate-rise rounded-card bg-fb-surface p-3 shadow-card', className)}>
      <p className="mb-1.5 text-[15px] font-semibold text-fb-text">✨ Muse is working</p>
      <ul className="flex flex-col gap-1">
        {steps.slice(0, shown).map((label, i) => {
          const current = i === shown - 1;
          return (
            <li key={label} className={cn('flex animate-step-in items-center gap-2 text-[13px]', current ? 'text-fb-text' : 'text-fb-text-2')}>
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

function RuledOutItem({ row }: { row: RuledOutRow }) {
  return (
    <li data-testid="ruled-out" data-reason={row.reason} className="flex min-w-0 gap-2 text-[13px] leading-[18px] text-fb-text-2">
      <span aria-hidden className="w-4 shrink-0 text-center">{row.emoji}</span>
      <span className="min-w-0">
        <span className="font-semibold text-fb-text">{row.title}</span>: {row.text}
      </span>
    </li>
  );
}

/**
 * What was checked and who did it, open by default so a judge sees it without a tap. Code
 * counted the plans and friends and ruled plans out (candidates.ts), so those lines carry no
 * Muse label. The read line says ✨ Muse when the live model parsed the words, and the rank line
 * when the live model ranked and explained the picks. The other ruled-out rows open on "N more".
 */
export function MuseWorkPanel({ work }: { work: MuseWork }) {
  const [open, setOpen] = useState(false);
  const { top, more, offTopic } = work.ruledOut;
  const hasDetails = more.length > 0 || offTopic > 0;
  const toggle = hasDetails ? (
    <button
      type="button"
      aria-expanded={open}
      data-testid="muse-work-more"
      onClick={() => setOpen((v) => !v)}
      className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-fb-blue hover:underline"
    >
      {open ? 'Less' : more.length > 0 ? `${more.length} more` : 'Details'}
      {open ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
    </button>
  ) : null;

  return (
    <section data-testid="muse-work" aria-label="What was checked" className="mb-2 rounded-card bg-fb-surface px-3 py-2.5 shadow-card">
      <p data-testid="muse-work-checked" className="text-[15px] font-semibold leading-5 text-fb-text">
        {work.checked}
        {work.fit && <span className="font-normal text-fb-text-2"> · {work.fit}</span>}
      </p>
      <p data-testid="muse-work-read" data-by={work.readByMuse ? 'muse' : 'code'} className="mt-1 text-[13px] leading-[18px] text-fb-text-2">
        {work.readByMuse
          ? <span className="font-semibold text-fb-blue">✨ Muse read:</span>
          : <span className="font-semibold text-fb-text">Read</span>}
        {' '}<span className="text-fb-text">{work.read.join(' · ')}</span>
        {/* The walk cap is code's default when the ask named none: muted, and not part of what was read. */}
        {work.walkDefault && <span data-testid="muse-work-walk-default"> · {work.walkDefault}</span>}
      </p>
      {work.friends && (
        <p data-testid="muse-work-friends" className="mt-0.5 flex items-center gap-1.5 text-[13px] leading-[18px] text-fb-text-2">
          <Users size={13} aria-hidden className="shrink-0" />
          {work.friends}
        </p>
      )}
      <p
        data-testid="muse-work-rank"
        data-by={work.rankByMuse ? 'muse' : 'code'}
        title={work.rank}
        className={cn('mt-0.5 truncate text-[13px] leading-[18px]', work.rankByMuse ? 'font-semibold text-fb-text' : 'text-fb-text-2')}
      >
        {work.rankByMuse ? <span className="text-fb-blue">✨ Muse</span> : null}
        {work.rankByMuse ? ` ${work.rank.replace(/^Muse /, '')}` : work.rank}
      </p>
      {top.length > 0 ? (
        <div className="mt-1.5 border-t border-fb-divider pt-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold uppercase tracking-[0.02em] text-fb-text-2">Ruled out</span>
            {toggle}
          </div>
          <ul data-testid="why-not" className="mt-0.5 flex flex-col gap-0.5">
            {top.map((r) => <RuledOutItem key={r.questId} row={r} />)}
            {open && more.map((r) => <RuledOutItem key={r.questId} row={r} />)}
          </ul>
        </div>
      ) : (
        toggle && <div className="mt-1 flex justify-end">{toggle}</div>
      )}
      {open && offTopic > 0 && (
        <p data-testid="muse-work-details" className="mt-1 text-[13px] leading-[18px] text-fb-text-2">
          {offTopic} other{offTopic === 1 ? " wasn't" : "s weren't"} what you asked for
        </p>
      )}
    </section>
  );
}
