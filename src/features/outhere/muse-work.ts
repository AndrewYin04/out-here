// "What Muse did" on the plan sheet, shown without a tap: what it read from your words, how
// many plans and friends it checked, what it ruled out and why. Built only from the plan
// response (numbers code computed); pure and client-safe.
import { formatDemoTime } from '@/shared';
import { askLimits, ruledOut, type RuledOut } from './dropped';
import { rankStep, windowText } from './muse-steps';
import type { PlanResponse, PlanResult } from './plan-api';

export type MuseWork = {
  /** "Muse checked 17 plans and 6 friends" */
  checked: string;
  /** "2 fit", or null when nothing was checked. */
  fit: string | null;
  /** Your words as Muse read them: ["food", "40 min", "under $15", "up to 25 min walk"]. */
  read: string[];
  /** "Maya is free till 3:58 PM", or null when no friends were checked. */
  friends: string | null;
  ruledOut: RuledOut;
  /** How the picks were ranked: "Muse ranked 2 of 2 and explained why · 1.2 s". */
  rank: string;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function readParts(plan: PlanResponse, now: Date): string[] {
  const { intent } = plan;
  const parts: string[] = [];
  const acts = intent.activities.map((a) => a.trim()).filter(Boolean).slice(0, 2);
  parts.push(acts.length > 0 ? acts.join(', ') : 'anything');
  const w = windowText(plan, now);
  if (w) parts.push(w);
  if (intent.budgetMax !== null) parts.push(`under $${intent.budgetMax}`);
  parts.push(`up to ${askLimits(intent).walkCap} min walk`);
  return parts;
}

function friendsLine(plan: PlanResponse): string | null {
  const free = plan.meta.friendsFree ?? [];
  const checked = plan.meta.friendsChecked;
  if (free.length === 0) return checked === 0 ? null : 'None of your friends are free then';
  const named = free.map((f) => `${f.firstName} till ${formatDemoTime(f.freeUntil)}`);
  if (free.length === 1) return `${free[0].firstName} is free till ${formatDemoTime(free[0].freeUntil)}`;
  if (free.length === 2) return `Free then: ${named[0]}, ${named[1]}`;
  return `Free then: ${named[0]}, ${named[1]} +${free.length - 2}`;
}

/**
 * Null when Muse could not read the ask; the sheet then shows only its summary. topN: ruled-out
 * rows shown without a tap (the phone sheet shows 2 so the first pick's buttons stay on screen).
 */
export function museWork(plan: PlanResponse, source: PlanResult['museSource'], now: Date = new Date(), topN = 3): MuseWork | null {
  if (plan.meta.understood === false) return null;
  const fitN = plan.meta.candidateCount ?? plan.suggestions.length;
  const dropped = plan.meta.dropped ?? [];
  const plansN = fitN + new Set(dropped.map((d) => d.questId)).size;
  const friendsN = plan.meta.friendsChecked;
  const checked = friendsN === undefined
    ? `Muse checked ${plural(plansN, 'plan')}`
    : `Muse checked ${plural(plansN, 'plan')} and ${plural(friendsN, 'friend')}`;
  return {
    checked,
    fit: plansN > 0 ? `${fitN} fit` : null,
    read: readParts(plan, now),
    friends: friendsLine(plan),
    ruledOut: ruledOut(dropped, askLimits(plan.intent), topN),
    rank: rankStep(plan, source).text,
  };
}
