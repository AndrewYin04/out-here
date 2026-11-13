'use client';
// "I'm free", Muse-led: Jolly front and centre, and under him the plan pipeline as it actually
// runs. Each row lights up when the server reports that stage finished (POST /api/muse/plan?stream=1)
// with what it found: what Muse read, who is free, how many plans fit and why others dropped,
// which model ranked them, and what validation kept, each with its real model and time. Nothing
// is shown before the server says it happened; the row after the last finished one is "working".
import { Check, ChevronDown, ChevronUp, Loader2, Minus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MuseOrb } from '@/features/muse-companion';
import { cn } from '@/features/ui';
import { apiFetch } from '@/features/data';
import { PLAN_STAGES, type MuseOp, type PlanStage, type PlanStageEvent } from '@/shared';
import { museSteps } from './muse-steps';
import type { PlanResponse, PlanResult } from './plan-api';

const TITLE: Record<PlanStage, string> = {
  context: 'Looked at what I can use',
  parse: 'Read what you asked',
  candidates: 'Checked who’s free and what fits',
  rank: 'Ranked and explained the best fits',
  validate: 'Double-checked every fact',
};
const DOING: Record<PlanStage, string> = {
  context: 'Loading your friends and plans nearby…',
  parse: 'Reading what you asked…',
  candidates: 'Checking who’s free and what fits…',
  rank: 'Ranking the plans that fit…',
  validate: 'Re-checking walks, times and seats…',
};
const DROP: Record<string, string> = { walk: 'too far', budget: 'over budget', window: 'wrong time', late: 'wrong time', full: 'full', activity: 'not what you asked' };

export function modelName(m: string): string {
  if (/ember/i.test(m)) return 'Muse Ember';
  if (/spark/i.test(m)) return 'Muse Spark';
  if (/wonder/i.test(m)) return 'Muse Wonder';
  if (m === 'heuristic') return 'code fallback';
  if (m === 'mock') return 'offline';
  return m;
}
const secs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.max(1, Math.round(ms))} ms`);

/** The one-line facts for a finished stage, from the event itself. */
function detail(e: PlanStageEvent): { text: string; who: string } {
  switch (e.stage) {
    case 'context':
      return { text: `${e.friends} friend${e.friends === 1 ? '' : 's'} · ${e.quests} plan${e.quests === 1 ? '' : 's'} you can see`, who: `code · ${secs(e.ms)}` };
    case 'parse': {
      const t = e.understood
        ? museSteps({ intent: e.intent, suggestions: [], summary: '', meta: { dropped: [] } } as unknown as PlanResponse, 'muse')[0]?.text.replace(/^Got it: /, '') ?? ''
        : 'couldn’t tell what you’re up for';
      return { text: t, who: `${modelName(e.model)}${e.cached ? ' · saved answer' : ''} · ${secs(e.ms)}` };
    }
    case 'candidates': {
      const names = e.friendsFree.map((f) => f.firstName);
      const free = names.length === 0 ? 'no friends free then' : names.length <= 2 ? `${names.join(' and ')} free` : `${names.slice(0, 2).join(', ')} +${names.length - 2} free`;
      const why = new Map<string, number>();
      for (const d of e.dropped) { const l = DROP[d.reason]; if (l && l !== 'not what you asked') why.set(l, (why.get(l) ?? 0) + 1); }
      const out = [...why].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([l, n]) => `${n} ${l}`);
      return { text: `${free} · ${e.fit} of ${e.checked} plans fit${out.length ? ` (${out.join(', ')})` : ''}`, who: `code · ${secs(e.ms)}` };
    }
    case 'rank':
      return { text: e.fallback ? `Muse didn’t answer in time, so sorted by time and distance` : `${e.picks} pick${e.picks === 1 ? '' : 's'}, each with a reason`, who: `${modelName(e.model)}${e.cached ? ' · saved answer' : ''} · ${secs(e.ms)}` };
    case 'validate':
      return { text: e.removed > 0 ? `kept ${e.kept}, removed ${e.removed} that didn’t check out` : `all ${e.kept} check out against the data`, who: `code · ${secs(e.ms)}` };
  }
}

/** The pipeline rail: finished stages with their facts, the current one working, the rest waiting. */
function Rail({ stages, done, compact }: { stages: PlanStageEvent[]; done: boolean; compact?: boolean }) {
  const by = new Map(stages.map((s) => [s.stage, s]));
  // Stages that never ran (nothing understood, or nothing fit so there was nothing to rank).
  const skipped = (st: PlanStage) => done && !by.has(st);
  const current = done ? null : PLAN_STAGES.find((st) => !by.has(st)) ?? null;
  return (
    <ol data-testid="muse-rail" className={cn('relative flex flex-col', compact ? 'gap-1.5' : 'gap-2.5')}>
      {PLAN_STAGES.map((st) => {
        const e = by.get(st);
        const d = e ? detail(e) : null;
        const state = e ? 'done' : st === current ? 'now' : skipped(st) ? 'skipped' : 'wait';
        return (
          <li key={st} data-stage={st} data-state={state} className={cn('muse-rail-row flex gap-2.5', state === 'wait' && 'opacity-45')}>
            <span className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
              state === 'done' ? 'bg-fb-blue text-white' : state === 'now' ? 'bg-[#E7F3FF] text-fb-blue' : 'bg-fb-secondary-btn text-fb-text-2')}>
              {state === 'done' ? <Check size={12} strokeWidth={3} aria-hidden /> : state === 'now' ? <Loader2 size={12} className="motion-safe:animate-spin" aria-hidden /> : <Minus size={12} aria-hidden />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className={cn('text-[14px] font-semibold leading-5', state === 'now' ? 'text-fb-blue' : 'text-fb-text')}>
                  {state === 'now' ? DOING[st] : TITLE[st]}
                </p>
                {d && <span data-testid="muse-rail-who" className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-fb-text-2">{d.who}</span>}
              </div>
              {d && <p className="muse-rail-detail text-[13px] leading-[18px] text-fb-text-2">{d.text}</p>}
              {state === 'skipped' && <p className="text-[13px] leading-[18px] text-fb-text-2">Not needed this time</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** While Muse works: Jolly big, the live line, and the rail. */
export function MuseWorking({ stages }: { stages: PlanStageEvent[] }) {
  const current = PLAN_STAGES.find((st) => !stages.some((s) => s.stage === st)) ?? 'validate';
  return (
    <div data-testid="muse-at-work" className="animate-rise rounded-card bg-fb-surface p-4 shadow-card">
      <div className="mb-3 flex flex-col items-center text-center">
        <MuseOrb state="thinking" size={76} className="muse-hero rounded-full" />
        <p className="mt-2 text-[12px] font-bold uppercase tracking-wide text-fb-blue">✨ Muse is on it</p>
        <p role="status" className="text-[16px] font-semibold text-fb-text">{DOING[current]}</p>
      </div>
      <Rail stages={stages} done={false} />
    </div>
  );
}

/** After the result: Muse's decision header, and "How Muse decided" (the rail, folded). */
export function MuseDecided({ stages, result, children }: { stages: PlanStageEvent[]; result: PlanResult; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const total = result.plan.meta?.timings?.totalMs;
  const summary = result.plan.summary.replace(/^\[mock\]\s*/, '');
  return (
    <div data-testid="muse-decided">
      <div className="mb-2 flex items-start gap-3 px-1">
        <MuseOrb state="responding" size={44} className="muse-hero rounded-full" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold uppercase tracking-wide text-fb-blue">
            {result.museSource === 'muse' ? '✨ Muse decided' : result.museSource === 'mock' ? 'Offline · Muse decided' : 'Muse (sorted by code)'}
          </p>
          {summary && <p data-testid="plan-summary" className="line-clamp-3 text-[14px] leading-5 text-fb-text">{summary}</p>}
        </div>
      </div>
      {children}
      {stages.length > 0 && (
        <div className="mt-2 rounded-card bg-fb-surface shadow-card">
          <button type="button" aria-expanded={open} data-testid="how-muse-decided" onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-card px-3 py-2.5 text-[15px] font-semibold text-fb-text hover:bg-fb-hover">
            <span>How Muse decided <span className="font-normal text-fb-text-2">· {stages.length} steps{typeof total === 'number' && total >= 100 ? ` · ${secs(total)}` : ''}</span></span>
            {open ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
          </button>
          {open && <div className="px-3 pb-3"><Rail stages={stages} done compact /></div>}
        </div>
      )}
      <MuseLog />
    </div>
  );
}

const JOB: [RegExp, string][] = [
  [/caption\/vision/, 'Looked at a photo'], [/caption/, 'Wrote a photo caption'], [/regroup/, 'Planned your crew’s next hangout'],
  [/draft-hang/, 'Drafted a hang with a friend'], [/create-quest/, 'Drafted a new plan'], [/encounter/, 'Talked with a friend’s Muse'],
  [/filter/, 'Filtered the map for you'], [/rating/, 'Summed up ratings'], [/finds|marketplace|watch/, 'Picked Marketplace finds'],
  [/wants/, 'Read what you want'], [/plan|intent|rank/, 'Planned an “I’m free”'],
];
const jobName = (route: string) => JOB.find(([re]) => re.test(route))?.[1] ?? 'Did a Muse job';

/** Every Muse job run for you recently, from the run log (all the AI routes, not only plans). */
export function MuseLog() {
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState<MuseOp[] | null>(null);
  useEffect(() => {
    let live = true;
    apiFetch<{ runs: MuseOp[] }>('/api/muse/runs').then((r) => { if (live) setRuns(r.runs); }).catch(() => { if (live) setRuns([]); });
    return () => { live = false; };
  }, []);
  if (!runs || runs.length === 0) return null;
  return (
    <div className="mt-2 rounded-card bg-fb-surface shadow-card">
      <button type="button" aria-expanded={open} data-testid="muse-log-toggle" onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-card px-3 py-2.5 text-[15px] font-semibold text-fb-text hover:bg-fb-hover">
        <span>What Muse did for you <span className="font-normal text-fb-text-2">· {runs.length} model call{runs.length === 1 ? '' : 's'}</span></span>
        {open ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
      </button>
      {open && (
        <ul data-testid="muse-log" className="px-3 pb-3">
          {runs.slice(0, 12).map((r, i) => (
            <li key={`${r.at}-${i}`} className="flex items-baseline justify-between gap-2 py-1 text-[13px]">
              <span className="min-w-0 truncate text-fb-text">{jobName(r.route)}</span>
              <span className="shrink-0 whitespace-nowrap text-[12px] text-fb-text-2">
                {modelName(r.model)}{r.cached ? ' · saved' : ''}{!r.ok ? ' · failed' : ''} · {secs(r.latencyMs)} · {new Date(r.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
