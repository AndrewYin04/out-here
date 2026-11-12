'use client';

import { ChevronDown, ChevronUp, SendHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useApi, useViewer } from '@/features/data';
import { Chip, IconButton, Skeleton, cn } from '@/features/ui';
import type { PersonCard } from '@/shared';
import { shownDrops } from './dropped';

import { errorText, requestPlan, shareAvailability, type PlanResult } from './plan-api';
import { setPlanOpen, setPlanSuggestions, usePlanOpen } from './plan-state';
import { MuseLabel, OfflineLabel, SuggestionCard } from './SuggestionCard';

export const COMPOSER_PLACEHOLDER = 'hungry, got like 40 min, under $15';
const CHIPS = ['15 min', '40 min', 'tonight', 'cheap eats', 'meet people'] as const;

/** Floating "I'm free" pill. Opens the plan sheet. */
export function ImFreeButton({ className }: { className?: string }) {
  const open = usePlanOpen();
  if (open) return null;
  return (
    <button
      type="button"
      onClick={() => setPlanOpen(true)}
      className={cn(
        'inline-flex h-12 items-center gap-2 rounded-full bg-fb-blue px-5 text-[17px] font-semibold text-white shadow-popover hover:bg-fb-blue-hover active:brightness-95',
        className,
      )}
    >
      <span aria-hidden>✨</span> I&apos;m free
    </button>
  );
}

function windowLabel(text: string): string {
  const m = text.match(/(\d+)\s*(min|minutes|m)\b/i);
  return m ? `${m[1]} minutes` : 'that time';
}

/** The "I'm free" composer and Muse's suggestions. InviteInbox is mounted once, globally, in AppShell. */
export function PlanSheet({ className }: { className?: string }) {
  const open = usePlanOpen();
  const { viewer } = useViewer();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<PlanResult | null>(null);
  const [asked, setAsked] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seq = useRef(0);
  const inFlight = useRef<AbortController | null>(null);
  const friends = useApi<{ friends: PersonCard[] }>(open ? '/api/friends' : null);
  const friendMap = useMemo(() => new Map((friends.data?.friends ?? []).map((f) => [f.id, f])), [friends.data]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    inFlight.current?.abort();
    setResult(null); setPlanSuggestions(null);
    setStatus('idle');
  }, [viewer.id]);
  useEffect(() => () => { inFlight.current?.abort(); setPlanSuggestions(null); }, []);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    // A new ask replaces one still in flight: abort it, and seq drops any late answer.
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    const mine = ++seq.current;
    setStatus('loading');
    setError(null);
    setWhyOpen(false);
    setAsked(t);
    try {
      const r = await requestPlan(t, ctrl.signal);
      if (mine !== seq.current) return;
      setResult(r); setPlanSuggestions(r.plan.suggestions);
      setStatus('done');
      // Only the ask whose results are shown becomes the viewer's availability.
      void shareAvailability(t, r.plan);
    } catch (err) {
      if (mine !== seq.current || ctrl.signal.aborted) return;
      setError(errorText(err, 'Muse could not make a plan right now. Try again in a moment.'));
      setStatus('error'); setPlanSuggestions(null);
    }
  };

  const addChip = (c: string) => {
    setText((prev) => (prev.trim() ? `${prev.trim().replace(/,$/, '')}, ${c}` : c));
    inputRef.current?.focus();
  };

  // ✨ Muse only on live model text. Mock (offline heuristic) text gets an "Offline" label.
  const showMuse = result?.museSource === 'muse';
  const offline = result?.museSource === 'mock';
  const summary = result?.plan.summary.replace(/^\[mock\]\s*/, '') ?? '';
  const drops = result ? shownDrops(result.plan.meta?.dropped ?? []) : [];

  return (
    <>
      {open && (
        <section
          aria-label="I'm free"
          data-testid="plan-sheet"
          className={cn(
            'absolute inset-x-0 bottom-0 z-30 flex max-h-[78%] flex-col rounded-t-[16px] bg-fb-surface shadow-popover',
            'md:inset-x-auto md:bottom-4 md:left-4 md:top-4 md:max-h-none md:w-[400px] md:rounded-card',
            className,
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-fb-divider md:hidden" aria-hidden />
          <header className="flex shrink-0 items-center justify-between px-4 pb-1 pt-2">
            <h2 className="text-[20px] font-bold text-fb-text">I&apos;m free</h2>
            <IconButton label="Close" size="md" onClick={() => setPlanOpen(false)}>
              <X size={20} aria-hidden />
            </IconButton>
          </header>

          <form onSubmit={(e) => void submit(e)} className="shrink-0 px-4">
            <div className="flex items-end gap-2 rounded-[20px] bg-fb-secondary-btn px-3 py-2">
              <label htmlFor="imfree-text" className="sr-only">What are you up for?</label>
              <textarea
                id="imfree-text"
                ref={inputRef}
                rows={1}
                value={text}
                maxLength={280}
                placeholder={COMPOSER_PLACEHOLDER}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); }
                }}
                className="max-h-24 min-h-6 flex-1 resize-none bg-transparent text-[15px] leading-6 text-fb-text outline-none placeholder:text-fb-text-2"
              />
              <button
                type="submit"
                aria-label="Find a plan"
                disabled={!text.trim()}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-fb-blue hover:bg-fb-hover disabled:text-fb-text-2 disabled:opacity-50"
              >
                <SendHorizontal size={20} aria-hidden />
              </button>
            </div>
            <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
              {CHIPS.map((c) => (
                <Chip key={c} onClick={() => addChip(c)} className="h-8 text-[13px]">{c}</Chip>
              ))}
            </div>
          </form>

          <div className="min-h-0 flex-1 overflow-y-auto bg-fb-bg px-3 pb-4 pt-3 md:rounded-b-card">
            {status === 'idle' && (
              <p className="px-1 text-[15px] text-fb-text-2">
                Say what you&apos;re up for. Muse checks which friends are free and what fits your time, walk included.
              </p>
            )}

            {status === 'loading' && (
              <div data-testid="plan-loading" aria-live="polite">
                <p className="mb-3 px-1 text-[15px] font-semibold text-fb-text">✨ Muse is checking who&apos;s free…</p>
                {[0, 1].map((i) => (
                  <div key={i} className="mb-2 rounded-card bg-fb-surface p-3 shadow-card">
                    <div className="flex gap-3">
                      <Skeleton shape="circle" width={40} height={40} />
                      <div className="flex-1"><Skeleton width="60%" className="h-4" /><Skeleton width="40%" className="mt-2 h-3" /></div>
                    </div>
                    <Skeleton className="mt-3 h-3 w-full" />
                    <Skeleton className="mt-3 h-9 w-full rounded-[8px]" />
                  </div>
                ))}
              </div>
            )}

            {status === 'error' && <p role="alert" data-testid="plan-error" className="px-1 text-[15px] text-fb-red">{error}</p>}

            {status === 'done' && result && (
              <div aria-live="polite">
                {summary && (
                  <div data-testid="plan-summary" className="mb-3 px-1">
                    {showMuse && <MuseLabel className="mb-1" />}
                    {offline && <OfflineLabel className="mb-1" />}
                    <p className="text-[15px] leading-5 text-fb-text">{summary}</p>
                  </div>
                )}
                {result.plan.suggestions.length === 0 ? (
                  <div data-testid="plan-empty" className="rounded-card bg-fb-surface p-4 text-center shadow-card">
                    <p className="text-[17px] font-semibold text-fb-text">No plan fits {windowLabel(asked)} right now</p>
                    <p className="mt-1 text-[13px] text-fb-text-2">Try a longer window, or tap &quot;40 min&quot;.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {result.plan.suggestions.map((s, i) => (
                      <SuggestionCard key={`${s.questId ?? s.title}-${i}`} s={s} friends={friendMap} showMuse={showMuse} />
                    ))}
                  </div>
                )}
                {drops.length > 0 && (
                  <div className="mt-3 rounded-card bg-fb-surface shadow-card">
                    <button
                      type="button"
                      aria-expanded={whyOpen}
                      onClick={() => setWhyOpen((v) => !v)}
                      className="flex w-full items-center justify-between rounded-card px-3 py-2.5 text-[15px] font-semibold text-fb-text hover:bg-fb-hover"
                    >
                      Why not others?
                      {whyOpen ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
                    </button>
                    {whyOpen && (
                      <ul data-testid="why-not" className="px-3 pb-3">
                        {drops.map((d) => (
                          <li key={d.questId} className="flex gap-2 py-1 text-[13px] text-fb-text-2">
                            <span aria-hidden>{d.emoji}</span>
                            <span><span className="font-semibold text-fb-text">{d.venueName}</span>: {d.text}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
