// "Muse's work": the steps the plan pipeline took, in plain words, built only from the plan
// response (real numbers, never placeholders). Pure and client-safe.
import { formatDemoTime } from '@/shared';
import type { DropReasonCode } from './dropped';
import type { PlanResponse, PlanResult } from './plan-api';

export type MuseStepKey = 'intent' | 'friends' | 'plans' | 'rank';
export type MuseStep = { key: MuseStepKey; text: string; tone: 'ok' | 'muted' };

/** Short labels for the plans step; longer reasons live in dropped.ts for "Why not others?". */
const SHORT: Record<DropReasonCode, string> = {
  walk: 'too far',
  budget: 'over budget',
  window: 'wrong time',
  late: 'wrong time',
  full: 'full',
  activity: 'not what you asked',
  already_member: 'other',
  small_group: 'other',
  not_open: 'other',
};

function windowText(plan: PlanResponse, now: Date): string | null {
  const end = Date.parse(plan.intent.windowEnd);
  const start = Math.max(Date.parse(plan.intent.windowStart) || now.getTime(), now.getTime());
  if (!Number.isFinite(end) || end <= start) return null;
  const minutes = Math.round((end - start) / 60_000);
  return minutes <= 120 ? `${minutes} min` : `till ${formatDemoTime(plan.intent.windowEnd)}`;
}

function intentStep(plan: PlanResponse, now: Date): MuseStep {
  const { intent } = plan;
  const parts: string[] = [];
  const acts = intent.activities.map((a) => a.trim()).filter(Boolean).slice(0, 2);
  if (acts.length > 0) parts.push(acts.join(', '));
  const w = windowText(plan, now);
  if (w) parts.push(w);
  if (intent.budgetMax !== null) parts.push(`under $${intent.budgetMax}`);
  if (intent.maxWalkMinutes !== null) parts.push(`≤${intent.maxWalkMinutes} min walk`);
  return { key: 'intent', text: parts.length > 0 ? `Got it: ${parts.join(' · ')}` : 'Got it: anything nearby', tone: 'ok' };
}

function friendsStep(plan: PlanResponse): MuseStep {
  const free = plan.meta.friendsFree ?? [];
  if (free.length === 0) return { key: 'friends', text: 'No friends free in that window', tone: 'muted' };
  if (free.length === 1) {
    const f = free[0];
    return { key: 'friends', text: `${f.firstName} is free till ${formatDemoTime(f.freeUntil)}`, tone: 'ok' };
  }
  const names = free.map((f) => f.firstName);
  const text = names.length === 2
    ? `${names[0]} and ${names[1]} are free`
    : `${names[0]}, ${names[1]} +${names.length - 2} are free`;
  return { key: 'friends', text, tone: 'ok' };
}

function plansStep(plan: PlanResponse): MuseStep {
  const fit = plan.meta.candidateCount ?? plan.suggestions.length;
  const dropped = plan.meta.dropped ?? [];
  const total = fit + dropped.length;
  if (total === 0) return { key: 'plans', text: 'No open plans nearby right now', tone: 'muted' };
  const counts = new Map<string, number>();
  for (const d of dropped) {
    const label = SHORT[d.reason] ?? 'other';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  // Time, distance, budget and seats tell the story; "not what you asked" comes after them.
  const rank = (l: string) => (l === 'not what you asked' ? 1 : 0);
  const named = [...counts.entries()].filter(([l]) => l !== 'other').sort((a, b) => rank(a[0]) - rank(b[0]) || b[1] - a[1]);
  const top = named.slice(0, 3);
  const rest = dropped.length - top.reduce((n, [, c]) => n + c, 0);
  const parts = [`${fit} fit`, ...top.map(([l, c]) => `${c} ${l}`)];
  if (rest > 0) parts.push(`${rest} other`);
  return { key: 'plans', text: `Checked ${total} plan${total === 1 ? '' : 's'}: ${parts.join(' · ')}`, tone: fit > 0 ? 'ok' : 'muted' };
}

function rankStep(plan: PlanResponse, source: PlanResult['museSource']): MuseStep {
  const fit = plan.meta.candidateCount ?? plan.suggestions.length;
  if (fit === 0) return { key: 'rank', text: 'Nothing left to rank', tone: 'muted' };
  const n = plan.suggestions.length;
  const ms = plan.meta.timings?.totalMs;
  // Under 0.1 s means a dev cache answered; "0.0 s" would read as fake, so leave it out.
  const secs = typeof ms === 'number' && ms >= 100 ? ` · ${(ms / 1000).toFixed(1)} s` : '';
  if (source === 'mock') return { key: 'rank', text: `Ranked offline (mock): ${n} pick${n === 1 ? '' : 's'}${secs}`, tone: 'muted' };
  if (source === 'fallback') return { key: 'rank', text: `Muse didn't answer in time, so sorted by time and distance${secs}`, tone: 'muted' };
  return { key: 'rank', text: `Muse ranked ${n} of ${fit} and explained why${secs}`, tone: 'ok' };
}

export function museSteps(plan: PlanResponse, source: PlanResult['museSource'], now: Date = new Date()): MuseStep[] {
  if (plan.meta.understood === false) {
    return [{ key: 'intent', text: "Couldn't tell what you're up for. Try \"food, 30 min\".", tone: 'muted' }];
  }
  return [intentStep(plan, now), friendsStep(plan), plansStep(plan), rankStep(plan, source)];
}

/** Generic labels shown while the request runs. They name steps, never results. */
export const LOADING_STEPS: readonly string[] = [
  'Reading what you asked for…',
  'Checking which friends are free…',
  'Checking plans nearby…',
  'Ranking what fits…',
];
