'use client';

import { ChevronDown, ChevronUp, Coffee, Timer, CupSoda, Dumbbell, Footprints, Gamepad2, Hand, Music, Palette, SendHorizontal, Sparkles, Utensils, X, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { useApi, useViewer } from '@/features/data';
import { CategoryIcon, categoryOf, cn, IconButton, Skeleton } from '@/features/ui';
import type { PersonCard } from '@/shared';
import { shownDrops } from './dropped';
import { museSteps } from './muse-steps';
import { MuseStepsDone, MuseStepsLoading } from './MuseSteps';

import { errorText, requestPlan, shareAvailability, type PlanResult } from './plan-api';
import { setPlanAsk, setPlanOpen, setPlanStatus, setPlanSuggestions, usePlanOpen, usePlanPrefill, useTogetherId } from './plan-state';
import { StatusDot, useMyStatus } from './FreeStatus';
import { freeStatusLabel } from '@/shared';
import { MuseLabel, OfflineLabel, SuggestionCard } from './SuggestionCard';
import { DraftHangCard } from './DraftHangCard';

export const COMPOSER_PLACEHOLDER = 'Or tell Muse… e.g. with someone who likes comics';

// "For how long?" (pick one) and "Up for…" (pick any). Picking never sends anything: the two
// buttons do. Find plans asks Muse with what you picked; Just show I'm free only sets your status.
const DURATIONS = [
  { id: '15', label: '15 min', short: '15m', min: 15 }, { id: '30', label: '30 min', short: '30m', min: 30 },
  { id: '45', label: '45 min', short: '45m', min: 45 }, { id: '60', label: '1 hr', short: '1h', min: 60 },
  { id: 'tonight', label: 'Tonight', short: 'Tonight', min: null },
] as const;
const BUDGETS = [{ id: '$', ask: 'under $15', label: 'Under $15' }, { id: '$$', ask: 'under $30', label: 'Under $30' }] as const;
type BudgetId = (typeof BUDGETS)[number]['id'];
type DurationId = (typeof DURATIONS)[number]['id'];
const MOODS = [
  { id: 'hungry', Icon: Utensils, label: 'Food', ask: 'hungry' }, { id: 'coffee', Icon: Coffee, label: 'Coffee', ask: 'coffee' },
  { id: 'boba', Icon: CupSoda, label: 'Boba', ask: 'boba' }, { id: 'sports', Icon: Dumbbell, label: 'Active', ask: 'sports' },
  { id: 'games', Icon: Gamepad2, label: 'Games', ask: 'games' }, { id: 'art', Icon: Palette, label: 'Art', ask: 'art' },
  { id: 'music', Icon: Music, label: 'Music', ask: 'live music' }, { id: 'walk', Icon: Footprints, label: 'Walk', ask: 'a walk' },
  { id: 'people', Icon: Hand, label: 'New people', ask: 'meet people' },
] as const;
/** Picking a time and something you're up for asks Muse on its own after this pause. */
const AUTO_ASK_MS = 700;

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
function composeAsk(moods: ReadonlySet<string>, text: string, duration: DurationId | null, budget: BudgetId | null = null): string {
  const t = text.trim().replace(/[,\s]+$/, '');
  const parts = [...MOODS.filter((m) => moods.has(m.id)).map((m) => m.ask), budget ? BUDGETS.find((b) => b.id === budget)!.ask : '', t];
  if (duration && !mentionsTime(t)) parts.push(duration === 'tonight' ? 'tonight' : DURATIONS.find((d) => d.id === duration)!.label);
  return parts.filter(Boolean).join(', ');
}
/** The note friends see: moods and text, no times ("hungry, under $15"). */
function noteFor(moods: ReadonlySet<string>, text: string): string {
  return [...MOODS.filter((m) => moods.has(m.id)).map((m) => m.ask), text.trim()].filter(Boolean).join(', ') || 'free';
}

/** Time and budget: rounded chips, one line. */
function Chip({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} onClick={onClick}
      className={cn(
        'oh-press inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[16px] font-semibold transition-colors',
        on ? 'bg-fb-blue text-white shadow-[0_4px_12px_rgba(8,102,255,.35)]' : 'bg-fb-secondary-btn text-fb-text hover:brightness-95',
      )}>
      {children}
    </button>
  );
}

/** What you're up for: a round line icon with a small label, so the row reads at a glance. */
function Activity({ on, onClick, Icon, label }: { on: boolean; onClick: () => void; Icon: LucideIcon; label: string }) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} onClick={onClick}
      className="oh-press flex w-[62px] shrink-0 flex-col items-center gap-1">
      <span aria-hidden className={cn(
        'flex size-[54px] items-center justify-center rounded-full transition-all',
        on ? 'bg-fb-blue text-white shadow-[0_4px_12px_rgba(8,102,255,.35)] [&]:scale-105' : 'bg-fb-secondary-btn text-fb-text',
      )}><Icon size={24} /></span>
      <span className={cn('text-[11px] font-semibold', on ? 'text-fb-blue' : 'text-fb-text-2')}>{label}</span>
    </button>
  );
}

function Row({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-24px),transparent)] [scrollbar-width:none]">
      {children}
    </div>
  );
}

/**
 * The one "I'm free" button. It also shows your status ("Free till 3:49"), so status and Muse
 * live in one place: tapping it opens the composer, where you can ask Muse or just set free/busy.
 */
export function ImFreeButton({ className, quiet = false }: {
  className?: string;
  /** A plan is up next: show as a white status chip so its Let's go is the only blue button. */
  quiet?: boolean;
}) {
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
        'oh-press inline-flex animate-pop-in items-center gap-2 rounded-full font-semibold shadow-popover active:brightness-95',
        quiet ? 'h-11 bg-fb-surface px-4 text-[15px] text-fb-text hover:bg-fb-hover' : 'h-12 bg-fb-blue px-5 text-[17px] text-white hover:bg-fb-blue-hover',
        className,
      )}
    >
      {label ? (
        <><StatusDot s={status} className={cn('size-3 shrink-0', !quiet && 'ring-2 ring-white')} /><span className="min-w-0 truncate">{label}</span></>
      ) : (
        <><Sparkles size={18} aria-hidden /> I&apos;m free</>
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
  // No one matched a pick, but friends are free: name them (each pick has invite chips for them).
  const free = (plan.meta?.friendsFree ?? []).map((f) => f.firstName);
  const freeNames = free.length <= 2 ? free.join(' and ') : `${free.slice(0, 2).join(', ')} and ${free.length - 2} more`;
  const who = down.length === 0 && free.length > 0 ? `${freeNames} ${free.length === 1 ? 'is' : 'are'} free too`
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
  const [budget, setBudget] = useState<BudgetId | null>(null);
  /** Muse's top pick leads; the rest wait behind "Other ideas". */
  const [othersOpen, setOthersOpen] = useState(false);
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
  // No focus on open: on a phone the keyboard would cover the chips, which are the main way in.
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

  const ask = composeAsk(moods, text, duration, budget);
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
    setOthersOpen(false);
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

  // Picking is asking: once there's a time and something you're up for, Muse goes on its own.
  const autoKey = duration && moods.size > 0 ? `${duration}|${budget ?? ''}|${[...moods].sort().join(',')}` : '';
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    if (!open || !autoKey) return;
    const t = window.setTimeout(() => void submitRef.current(), AUTO_ASK_MS);
    return () => window.clearTimeout(t);
  }, [open, autoKey]);

  // Escape closes the sheet (like its X), and focus returns to I'm free.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      setPlanOpen(false);
      window.setTimeout(() => document.querySelector<HTMLElement>('[data-testid="im-free"]')?.focus(), 0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // ✨ Muse only on live model text. Mock (offline heuristic) text gets an "Offline" label.
  const showMuse = result?.museSource === 'muse';
  const offline = result?.museSource === 'mock';
  const summary = result?.plan.summary.replace(/^\[mock\]\s*/, '') ?? '';
  // Nothing posted fits but a friend is free: Muse drafts a plan for you two (DraftHangCard).
  // Friends free in this window (their availability is shared with you): invite chips on each pick.
  // The plan carries each free friend's name and photo, so the chips never wait on /api/friends.
  const freeFriends = useMemo(() => (result?.plan.meta?.friendsFree ?? []).flatMap((f): PersonCard[] => {
    if (!f.id) return [];
    const known = friendMap.get(f.id);
    if (known) return [known];
    return f.name ? [{ id: f.id, handle: '', name: f.name, avatarUrl: f.avatarUrl ?? '', mutualFriendCount: 0, isFriend: true, online: false } as PersonCard] : [];
  }), [result, friendMap]);
  const drafting = !!result && result.plan.suggestions.length === 0 && (result.plan.meta?.friendsFree?.length ?? 0) > 0 && !draftNone;
  const drops = result ? shownDrops(result.plan.meta?.dropped ?? []) : [];
  const steps = useMemo(() => (result?.plan.meta ? museSteps(result.plan, result.museSource) : []), [result]);

  const picks = result?.plan.suggestions ?? [];
  return (
    <>
      {open && (
        <section
          aria-label="I'm free"
          data-testid="plan-sheet"
          className={cn(
            'absolute inset-x-0 bottom-0 z-30 flex animate-sheet-up flex-col rounded-t-[24px] bg-fb-surface shadow-popover',
            status === 'done' && picks.length > 0 ? 'max-h-[62%]' : 'max-h-[82%]',
            'md:bottom-4 md:left-1/2 md:w-[460px] md:-translate-x-1/2 md:rounded-[24px]',
            className,
          )}
        >
          <div className="relative flex h-9 shrink-0 justify-center pt-2">
            <div className="h-1 w-10 rounded-full bg-fb-divider" aria-hidden />
            <IconButton label="Close" size="sm" className="!absolute right-2 top-1" onClick={() => setPlanOpen(false)}>
              <X size={18} aria-hidden />
            </IconButton>
          </div>

          {/* After an ask the pickers fold into one line, so Muse's pick gets the room. */}
          {!pickersOpen && status !== 'idle' ? (
            <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-1" data-testid="picked-summary">
              {myStatus.status.kind !== 'busy' && <StatusDot s={myStatus.status} />}
              <p className="min-w-0 flex-1 truncate text-[14px] text-fb-text">
                {myStatus.status.kind !== 'busy' && <span className="font-semibold">{freeStatusLabel(myStatus.status)} · </span>}
                <span className="text-fb-text-2">{asked}</span>
              </p>
              <button type="button" onClick={() => setPickersOpen(true)}
                className="oh-press h-8 shrink-0 rounded-pill bg-fb-secondary-btn px-3 text-[13px] font-semibold text-fb-text">
                Change
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="shrink-0 px-4 pb-3 pt-1" data-testid="free-composer">
              <Row label="For how long">
                {DURATIONS.map((d) => (
                  <Chip key={d.id} on={duration === d.id} label={d.label} onClick={() => setDuration((cur) => (cur === d.id ? null : d.id))}>
                    {d.id === '15' && <Timer size={16} aria-hidden />}{d.short}
                  </Chip>
                ))}
                {BUDGETS.map((b) => (
                  <Chip key={b.id} on={budget === b.id} label={b.label} onClick={() => setBudget((cur) => (cur === b.id ? null : b.id))}>{b.id}</Chip>
                ))}
              </Row>
              <Row label="Up for">
                {MOODS.map((m) => (
                  <Activity key={m.id} on={moods.has(m.id)} onClick={() => toggleMood(m.id)} Icon={m.Icon} label={m.label} />
                ))}
              </Row>
              <div className="mt-2 flex items-center gap-2 rounded-full bg-fb-secondary-btn py-1 pl-4 pr-1 ring-fb-blue focus-within:ring-2">
                <label htmlFor="imfree-text" className="sr-only">Tell Muse</label>
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
                  className="block max-h-20 min-h-6 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-6 text-fb-text outline-none placeholder:text-fb-text-2 focus:outline-none focus-visible:outline-none"
                />
                <button type="submit" aria-label="Find a plan" title="Ask Muse" disabled={!ask.trim()}
                  className="oh-press flex size-9 shrink-0 items-center justify-center rounded-full bg-fb-blue text-white disabled:opacity-40">
                  <SendHorizontal size={18} aria-hidden />
                </button>
              </div>
              <div className="mt-1.5 flex justify-center">
                <button type="button" onClick={justFree} disabled={myStatus.busy} data-testid="just-free"
                  className="text-[13px] font-semibold text-fb-text-2 hover:underline disabled:opacity-50">
                  {myStatus.status.kind === 'busy' ? 'Just show friends I’m free' : 'Update my status'}
                </button>
              </div>
            </form>
          )}

          {status !== 'idle' && (
            <div className="min-h-0 flex-1 overflow-y-auto bg-fb-bg px-3 pb-4 pt-3 md:rounded-b-[24px]">
              {status === 'loading' && (
                <div data-testid="plan-loading" aria-live="polite">
                  <MuseStepsLoading />
                  <div className="mb-2 animate-rise rounded-card bg-fb-surface p-3 shadow-card" style={{ animationDelay: '90ms' }}>
                    <div className="flex gap-3">
                      <Skeleton shape="circle" width={40} height={40} />
                      <div className="flex-1"><Skeleton width="60%" className="h-4" /><Skeleton width="40%" className="mt-2 h-3" /></div>
                    </div>
                    <Skeleton className="mt-3 h-9 w-full rounded-[8px]" />
                  </div>
                </div>
              )}

              {status === 'error' && <p role="alert" data-testid="plan-error" className="px-1 text-[15px] text-fb-red">{error}</p>}

              {status === 'done' && result && (
                <div aria-live="polite">
                  {summary && (
                    <div data-testid="plan-summary" className="mb-2 animate-step-in px-1">
                      {showMuse && <MuseLabel className="mb-1" />}
                      {offline && <OfflineLabel className="mb-1" />}
                      <p className="line-clamp-2 text-[14px] leading-5 text-fb-text-2">{summary}</p>
                    </div>
                  )}
                  {!drafting && <PrecheckLine plan={result.plan} friends={friendMap} />}
                  {drafting ? (
                    <DraftHangCard ask={asked} budgetMax={result.plan.intent.budgetMax ?? null} onNone={onDraftNone} />
                  ) : picks.length === 0 ? (
                    <div data-testid="plan-empty" className="animate-rise rounded-card bg-fb-surface p-4 text-center shadow-card">
                      <p className="text-[17px] font-semibold text-fb-text">No plan fits {windowLabel(asked)} right now</p>
                      <p className="mt-1 text-[13px] text-fb-text-2">Try a longer time, like 1 hr.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {(othersOpen ? picks : picks.slice(0, 1)).map((s, i) => (
                        <div key={`${s.questId ?? s.title}-${i}`} className="animate-rise" style={{ animationDelay: `${80 + i * 90}ms` }}>
                          {i === 0 && <p className="mb-1 px-1 text-[12px] font-bold uppercase tracking-wide text-fb-blue">{showMuse ? <span className="inline-flex items-center gap-1"><Sparkles size={12} aria-hidden />Muse’s pick</span> : 'Best fit'}</p>}
                          <SuggestionCard s={s} friends={friendMap} showMuse={showMuse} alsoFree={freeFriends} />
                        </div>
                      ))}
                      {picks.length > 1 && !othersOpen && (
                        <button type="button" data-testid="other-ideas" onClick={() => setOthersOpen(true)}
                          className="oh-press h-10 rounded-card bg-fb-surface text-[14px] font-semibold text-fb-text shadow-card hover:bg-fb-hover">
                          Other ideas · {picks.length - 1}
                        </button>
                      )}
                    </div>
                  )}
                  {steps.length > 0 && <div className="mt-3"><MuseStepsDone steps={steps} showMuse={showMuse} /></div>}
                  {drops.length > 0 && (
                    <div className="mt-2 rounded-card bg-fb-surface shadow-card">
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
                              <CategoryIcon category={categoryOf(d.questId, d.emoji)} size={20} />
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
          )}
        </section>
      )}
    </>
  );
}
