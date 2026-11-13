'use client';

import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useApi, useViewer } from '@/features/data';
import { IconButton, Skeleton, cn } from '@/features/ui';
import type { PersonCard } from '@/shared';
import { shownDrops } from './dropped';
import { museSteps } from './muse-steps';
import { MuseStepsDone, MuseStepsLoading } from './MuseSteps';

import { errorText, requestPlan, shareAvailability, type PlanResult } from './plan-api';
import { setPlanAsk, setPlanOpen, setPlanStatus, setPlanSuggestions, usePlanOpen, usePlanPrefill, useTogetherId } from './plan-state';
import { StatusCard, StatusDot, useMyStatus } from './FreeStatus';
import { freeStatusLabel } from '@/shared';
import { MuseLabel, OfflineLabel, SuggestionCard } from './SuggestionCard';
import { DraftHangCard } from './DraftHangCard';

export const COMPOSER_PLACEHOLDER = 'Anything else? e.g. under $15, with Maya';

// "For how long?" (pick one) and "Up for…" (pick any). Picking never sends anything: the two
// buttons do. Find plans asks Muse with what you picked; Just show I'm free only sets your status.
const DURATIONS = [
  { id: '15', label: '15 min', min: 15 }, { id: '30', label: '30 min', min: 30 }, { id: '60', label: '1 hr', min: 60 },
  { id: '120', label: '2 hr', min: 120 }, { id: 'tonight', label: 'Tonight', min: null },
] as const;
type DurationId = (typeof DURATIONS)[number]['id'];
const MOODS = [
  { id: 'hungry', emoji: '🍜', label: 'Hungry', ask: 'hungry' }, { id: 'coffee', emoji: '☕', label: 'Coffee', ask: 'coffee' },
  { id: 'boba', emoji: '🧋', label: 'Boba', ask: 'boba' }, { id: 'walk', emoji: '🚶', label: 'Walk', ask: 'a walk' },
  { id: 'music', emoji: '🎵', label: 'Music', ask: 'live music' }, { id: 'games', emoji: '🎮', label: 'Games', ask: 'games' },
  { id: 'sports', emoji: '🏐', label: 'Sports', ask: 'sports' }, { id: 'people', emoji: '👋', label: 'Meet people', ask: 'meet people' },
  { id: 'cheap', emoji: '💸', label: 'Cheap', ask: 'something cheap' },
] as const;

/** Minutes from now until 11 PM in the demo's time zone (at least an hour). */
function minutesUntilTonight(): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
    .formatToParts(new Date());
  const h = Number(parts.find((x) => x.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((x) => x.type === 'minute')?.value ?? 0);
  return Math.max(60, 23 * 60 - (h * 60 + m));
}
const durationMinutes = (id: DurationId | null): number | null => {
  if (!id) return null;
  if (id === 'tonight') return minutesUntilTonight();
  return DURATIONS.find((d) => d.id === id)!.min;
};
/** Does the typed text already say how long ("40 min", "2 hours", "till 6", "tonight")? */
const mentionsTime = (t: string) => /\b\d+\s*(m|min|mins|minutes|h|hr|hrs|hour|hours)\b|\b(tonight|till|until|before|after)\b/i.test(t);

/** "hungry, boba, under $15, 1 hr". The picked time is left out when the text already has one. */
function composeAsk(moods: ReadonlySet<string>, text: string, duration: DurationId | null): string {
  const t = text.trim().replace(/[,\s]+$/, '');
  const parts = [...MOODS.filter((m) => moods.has(m.id)).map((m) => m.ask), t];
  if (duration && !mentionsTime(t)) parts.push(duration === 'tonight' ? 'tonight' : DURATIONS.find((d) => d.id === duration)!.label);
  return parts.filter(Boolean).join(', ');
}
/** The note friends see: moods and text, no times ("hungry, under $15"). */
function noteFor(moods: ReadonlySet<string>, text: string): string {
  return [...MOODS.filter((m) => moods.has(m.id)).map((m) => m.ask), text.trim()].filter(Boolean).join(', ') || 'free';
}

function Pill({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} onClick={onClick}
      className={cn(
        'oh-press inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-pill px-3 text-[13px] font-semibold transition-colors',
        on ? 'bg-fb-blue text-white' : 'bg-fb-secondary-btn text-fb-text hover:brightness-95',
      )}>
      {children}
    </button>
  );
}

function PickerRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-fb-text-2">{label}</p>
      <div className="-mx-4 mt-1 flex gap-2 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-24px),transparent)] [scrollbar-width:none]">
        {children}
      </div>
    </div>
  );
}

/**
 * The one "I'm free" button. It also shows your status ("Free till 3:49"), so status and Muse
 * live in one place: tapping it opens the composer, where you can ask Muse or just set free/busy.
 */
export function ImFreeButton({ className }: { className?: string }) {
  const open = usePlanOpen();
  const together = useTogetherId();
  const { status } = useMyStatus();
  if (open || together) return null;
  const label = status.kind === 'busy' ? null : freeStatusLabel(status);
  return (
    <button
      type="button"
      onClick={() => setPlanOpen(true)}
      aria-label={label ? `I'm free · ${label}` : "I'm free"}
      data-status={status.kind}
      data-testid="im-free"
      className={cn(
        'oh-press inline-flex h-12 animate-pop-in items-center gap-2 rounded-full bg-fb-blue px-5 text-[17px] font-semibold text-white shadow-popover hover:bg-fb-blue-hover active:brightness-95',
        className,
      )}
    >
      {label ? (
        <><StatusDot s={status} className="size-3 ring-2 ring-white" />{label}</>
      ) : (
        <><span aria-hidden>✨</span> I&apos;m free</>
      )}
    </button>
  );
}

/**
 * "Checked with 6 friends · Maya's likely down". Names only friends who came back likely down;
 * everyone else stays unnamed, so nobody's no is shown.
 */
function PrecheckLine({ plan, friends }: { plan: PlanResult['plan']; friends: Map<string, PersonCard> }) {
  const checked = plan.meta?.friendsChecked ?? 0;
  if (checked === 0) return null;
  const down = [...new Set(plan.suggestions.flatMap((s) => (s.precheck ?? []).map((c) => c.friendId)))]
    .flatMap((id) => { const p = friends.get(id); return p ? [p.name.split(' ')[0]] : []; });
  // Nothing fit: say who is free (Muse drafts a plan with them below) instead of "no one".
  const free = plan.suggestions.length === 0 ? (plan.meta?.friendsFree ?? []).map((f) => f.firstName) : [];
  const who = down.length === 0 && free.length > 0 ? `${free.slice(0, 2).join(' and ')} ${free.length === 1 ? 'is' : 'are'} free too`
    : down.length === 0 ? 'no one free for this yet'
    : down.length === 1 ? `${down[0]}'s likely down` : `${down.slice(0, -1).join(', ')} and ${down.at(-1)} are likely down`;
  return (
    <p data-testid="precheck-line" className="mb-3 px-1 text-[13px] text-fb-text-2">
      ✨ Asked your friends’ Muse · <span className="font-semibold text-fb-text">{who}</span>
    </p>
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
  /** The Muse draft found nothing (no friend free, or nothing open nearby): show the empty card. */
  const [draftNone, setDraftNone] = useState(false);
  const onDraftNone = useCallback(() => setDraftNone(true), []);
  const [duration, setDuration] = useState<DurationId | null>(null);
  const [moods, setMoods] = useState<Set<string>>(new Set());
  /** After an ask, the two picker rows fold into one line so Muse's results have room. */
  const [pickersOpen, setPickersOpen] = useState(true);
  const myStatus = useMyStatus();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seq = useRef(0);
  const inFlight = useRef<AbortController | null>(null);
  const friends = useApi<{ friends: PersonCard[] }>(open ? '/api/friends' : null);
  const friendMap = useMemo(() => new Map((friends.data?.friends ?? []).map((f) => [f.id, f])), [friends.data]);

  // /out-here?free=1 (the Feed's "I'm free" button) opens the sheet with the empty composer
  // focused. It never submits. The param is dropped so a reload or Back does not reopen it.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('free') !== '1') return;
    url.searchParams.delete('free');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    setPlanOpen(true);
  }, []);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  // "Make a plan" from the both-free nudge starts the composer with that friend's name.
  const prefill = usePlanPrefill();
  useEffect(() => {
    if (!prefill) return;
    setText(prefill.text);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    });
  }, [prefill]);
  useEffect(() => {
    inFlight.current?.abort();
    setResult(null); setPlanSuggestions(null); setPlanAsk(null); setPlanStatus(null);
    setStatus('idle');
  }, [viewer.id]);
  useEffect(() => () => { inFlight.current?.abort(); setPlanSuggestions(null); }, []);

  const ask = composeAsk(moods, text, duration);
  const toggleMood = (id: string) => setMoods((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  /** Just show I'm free / Update status: your status only, no Muse. */
  const justFree = () => {
    void myStatus.setFree(0, durationMinutes(duration) ?? 60, noteFor(moods, text));
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const t = ask.trim();
    if (!t) return;
    // A picked time sets your status right away (friends see it while Muse thinks).
    const picked = durationMinutes(duration);
    if (picked !== null) void myStatus.setFree(0, picked, noteFor(moods, text));
    setPickersOpen(false);
    // A new ask replaces one still in flight: abort it, and seq drops any late answer.
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    const mine = ++seq.current;
    setStatus('loading');
    setError(null);
    setWhyOpen(false);
    setAsked(t);
    setPlanAsk(t);
    setPlanStatus({ state: 'loading', summary: null, topTitle: null, topReason: null, error: null, live: false });
    try {
      const r = await requestPlan(t, ctrl.signal);
      if (mine !== seq.current) return;
      setResult(r); setPlanSuggestions(r.plan.suggestions); setDraftNone(false);
      setStatus('done');
      const top = r.plan.suggestions[0];
      setPlanStatus({
        state: 'done',
        summary: r.plan.summary.replace(/^\[mock\]\s*/, ''),
        topTitle: top?.title ?? null,
        topReason: top?.reason ?? null,
        error: null,
        live: r.museSource === 'muse',
      });
      // Only the ask whose results are shown becomes the viewer's availability (unless a time
      // was picked, which already set it).
      if (picked === null) void shareAvailability(noteFor(moods, text), r.plan);
    } catch (err) {
      if (mine !== seq.current || ctrl.signal.aborted) return;
      setError(errorText(err, 'Muse could not make a plan right now. Try again in a moment.'));
      setStatus('error'); setPlanSuggestions(null);
      setPlanStatus({ state: 'error', summary: null, topTitle: null, topReason: null, error: errorText(err, 'Muse could not make a plan right now.'), live: false });
    }
  };

  // ✨ Muse only on live model text. Mock (offline heuristic) text gets an "Offline" label.
  const showMuse = result?.museSource === 'muse';
  const offline = result?.museSource === 'mock';
  const summary = result?.plan.summary.replace(/^\[mock\]\s*/, '') ?? '';
  // Nothing posted fits but a friend is free: Muse drafts a plan for you two (DraftHangCard).
  const drafting = !!result && result.plan.suggestions.length === 0 && (result.plan.meta?.friendsFree?.length ?? 0) > 0 && !draftNone;
  const drops = result ? shownDrops(result.plan.meta?.dropped ?? []) : [];
  const steps = useMemo(() => (result?.plan.meta ? museSteps(result.plan, result.museSource) : []), [result]);

  return (
    <>
      {open && (
        <section
          aria-label="I'm free"
          data-testid="plan-sheet"
          className={cn(
            'absolute inset-x-0 bottom-0 z-30 flex animate-sheet-up flex-col rounded-t-[16px] bg-fb-surface shadow-popover md:animate-panel-in',
            result && result.plan.suggestions.length > 0 ? 'max-h-[50%]' : 'max-h-[82%]',
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

          {/* After an ask the whole top folds into one line, so Muse's results get the sheet. */}
          {!pickersOpen && status !== 'idle' ? (
            <div className="flex shrink-0 items-center gap-2 px-4 pb-3" data-testid="picked-summary">
              {myStatus.status.kind !== 'busy' && <StatusDot s={myStatus.status} />}
              <p className="min-w-0 flex-1 truncate text-[14px] text-fb-text">
                {myStatus.status.kind !== 'busy' && <span className="font-semibold">{freeStatusLabel(myStatus.status)} · </span>}
                <span className="text-fb-text-2">{asked}</span>
              </p>
              <button type="button" onClick={() => { setPickersOpen(true); requestAnimationFrame(() => inputRef.current?.focus()); }}
                className="oh-press h-8 shrink-0 rounded-pill bg-fb-secondary-btn px-3 text-[13px] font-semibold text-fb-text">
                Change
              </button>
            </div>
          ) : (<>
          <StatusCard />
          <form onSubmit={(e) => void submit(e)} className="shrink-0 px-4" data-testid="free-composer">
            <PickerRow label="For how long?">
              {DURATIONS.map((d) => (
                <Pill key={d.id} on={duration === d.id} onClick={() => setDuration((cur) => (cur === d.id ? null : d.id))}>{d.label}</Pill>
              ))}
            </PickerRow>
            <PickerRow label="Up for">
              {MOODS.map((m) => (
                <Pill key={m.id} on={moods.has(m.id)} onClick={() => toggleMood(m.id)} label={m.label}>
                  <span aria-hidden>{m.emoji}</span>{m.label}
                </Pill>
              ))}
            </PickerRow>
            <div className="mt-2 rounded-[14px] bg-fb-secondary-btn px-3 py-2 ring-fb-blue focus-within:ring-2">
              <label htmlFor="imfree-text" className="sr-only">Anything else?</label>
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
                className="block max-h-24 min-h-6 w-full resize-none bg-transparent text-[15px] leading-6 text-fb-text outline-none placeholder:text-fb-text-2 focus:outline-none focus-visible:outline-none"
              />
            </div>
            <div className="mt-2 flex gap-2 pb-3">
              <button type="submit" aria-label="Find a plan" disabled={!ask.trim()}
                className="oh-press h-10 flex-1 rounded-btn bg-fb-blue text-[15px] font-semibold text-white hover:bg-fb-blue-hover disabled:opacity-50">
                ✨ Find plans
              </button>
              <button type="button" onClick={justFree} disabled={myStatus.busy} data-testid="just-free"
                className="oh-press h-10 rounded-btn bg-fb-secondary-btn px-4 text-[15px] font-semibold text-fb-text hover:brightness-95 disabled:opacity-50">
                {myStatus.status.kind === 'busy' ? 'Just show I’m free' : 'Update status'}
              </button>
            </div>
          </form>
          </>)}

          <div className="min-h-0 flex-1 overflow-y-auto bg-fb-bg px-3 pb-4 pt-3 md:rounded-b-card">
            {status === 'idle' && (
              <p className="px-1 text-[15px] text-fb-text-2">
                Pick a time and what you&apos;re up for. Muse checks which friends are free and what fits, walk included.
              </p>
            )}

            {status === 'loading' && (
              <div data-testid="plan-loading" aria-live="polite">
                <MuseStepsLoading />
                {[0].map((i) => (
                  <div key={i} className="mb-2 animate-rise rounded-card bg-fb-surface p-3 shadow-card" style={{ animationDelay: '90ms' }}>
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
                {steps.length > 0 && <MuseStepsDone steps={steps} showMuse={showMuse} />}
                {summary && (
                  <div data-testid="plan-summary" className="mb-3 animate-step-in px-1">
                    {showMuse && <MuseLabel className="mb-1" />}
                    {offline && <OfflineLabel className="mb-1" />}
                    <p className="text-[15px] leading-5 text-fb-text">{summary}</p>
                  </div>
                )}
                {!drafting && <PrecheckLine plan={result.plan} friends={friendMap} />}
                {drafting ? (
                  <DraftHangCard ask={asked} budgetMax={result.plan.intent.budgetMax ?? null} onNone={onDraftNone} />
                ) : result.plan.suggestions.length === 0 ? (
                  <div data-testid="plan-empty" className="animate-rise rounded-card bg-fb-surface p-4 text-center shadow-card">
                    <p className="text-[17px] font-semibold text-fb-text">No plan fits {windowLabel(asked)} right now</p>
                    <p className="mt-1 text-[13px] text-fb-text-2">Try a longer time, like 1 hr.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {result.plan.suggestions.map((s, i) => (
                      <div key={`${s.questId ?? s.title}-${i}`} className="animate-rise" style={{ animationDelay: `${80 + i * 90}ms` }}>
                        <SuggestionCard s={s} friends={friendMap} showMuse={showMuse} />
                      </div>
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
