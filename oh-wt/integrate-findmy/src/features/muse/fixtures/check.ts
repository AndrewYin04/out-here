// Checks one plan result against a fixture's expected properties. Shared by the Vitest
// fixture run (mock mode) and scripts/eval-muse.mjs (real API).
import { DEMO_QUESTS, profileId, seedId } from '../../../shared';
import type { PlanOutput } from '../plan';
import { windowMinutes, wallClock } from '../time';
import fixturesJson from './plan.json';

export type PlanExpect = {
  topQuest?: string;
  topFriends?: string[];
  topHasInviteDraft?: boolean;
  includes?: string[];
  excludes?: string[];
  only?: string[];
  categories?: string[];
  minSuggestions?: number;
  maxSuggestions?: number;
  empty?: boolean;
  budgetMax?: number | null;
  windowMinutes?: number;
  startsWithinMin?: number;
  endsBy?: string;
  maxTravel?: number;
  maxPrice?: number;
};
export type PlanFixture = { id: string; viewer: string; text: string; expect: PlanExpect };
export type PlanFixtureFile = { description: string; now: string; cases: PlanFixture[] };

export const planFixtures = fixturesJson as PlanFixtureFile;

const keyById = new Map(DEMO_QUESTS.map((q) => [seedId('quest', q.key), q.key]));
const specByKey = new Map(DEMO_QUESTS.map((q) => [q.key, q]));

export function questKey(id: string | null): string | null {
  return id ? keyById.get(id) ?? null : null;
}

/** Failures as short sentences; empty when the result meets every expectation. */
export function checkPlanFixture(f: PlanFixture, out: PlanOutput, now: Date): string[] {
  const e = f.expect;
  const fail: string[] = [];
  const s = out.plan.suggestions;
  const keys = s.map((x) => questKey(x.questId));
  const top = s[0];

  if (e.empty && s.length > 0) fail.push(`expected no suggestions, got ${keys.join(', ')}`);
  if (e.minSuggestions !== undefined && s.length < e.minSuggestions) fail.push(`expected >= ${e.minSuggestions} suggestions, got ${s.length}`);
  if (s.length > (e.maxSuggestions ?? 3)) fail.push(`expected <= ${e.maxSuggestions ?? 3} suggestions, got ${s.length}`);
  if (e.topQuest && questKey(top?.questId ?? null) !== e.topQuest) fail.push(`top should be ${e.topQuest}, got ${questKey(top?.questId ?? null) ?? 'nothing'}`);
  for (const h of e.topFriends ?? []) {
    if (!top?.friendIds.includes(profileId(h))) fail.push(`top suggestion should invite ${h}`);
  }
  if (e.topHasInviteDraft && !top?.inviteDraft) fail.push('top suggestion should have an inviteDraft');
  for (const k of e.includes ?? []) if (!keys.includes(k)) fail.push(`missing ${k}`);
  for (const k of e.excludes ?? []) if (keys.includes(k)) fail.push(`should not include ${k}`);
  if (e.only) for (const k of keys) if (!k || !e.only.includes(k)) fail.push(`unexpected ${k ?? 'unknown quest'}`);
  if (e.categories) {
    for (const k of keys) {
      const cat = k ? specByKey.get(k)?.category : undefined;
      if (!cat || !e.categories.includes(cat)) fail.push(`${k} is not in ${e.categories.join('/')}`);
    }
  }
  if (e.maxPrice !== undefined) {
    for (const k of keys) if ((specByKey.get(k ?? '')?.priceMax ?? Infinity) > e.maxPrice) fail.push(`${k} costs more than $${e.maxPrice}`);
  }
  if (e.maxTravel !== undefined) for (const x of s) if (x.travelMinutes > e.maxTravel) fail.push(`${questKey(x.questId)} is a ${x.travelMinutes} min walk`);
  if (e.startsWithinMin !== undefined) {
    for (const x of s) {
      const mins = (Date.parse(x.startsAt) - now.getTime()) / 60_000;
      if (mins > e.startsWithinMin) fail.push(`${questKey(x.questId)} starts in ${Math.round(mins)} min`);
    }
  }
  for (const x of s) {
    if (x.fitsWindow !== true) fail.push(`${questKey(x.questId)} fitsWindow is not true`);
    if (!x.reason) fail.push(`${questKey(x.questId)} has no reason`);
  }

  const intent = out.plan.intent;
  if (e.budgetMax !== undefined && intent.budgetMax !== e.budgetMax) fail.push(`budgetMax should be ${e.budgetMax}, got ${intent.budgetMax}`);
  if (e.windowMinutes !== undefined) {
    const m = windowMinutes(intent.windowStart, intent.windowEnd);
    if (Math.abs(m - e.windowMinutes) > 1) fail.push(`window should be ${e.windowMinutes} min, got ${m}`);
  }
  if (e.endsBy) {
    const w = wallClock(new Date(intent.windowEnd));
    const got = `${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`;
    if (got !== e.endsBy) fail.push(`window should end at ${e.endsBy}, got ${got}`);
  }
  if (!out.plan.summary) fail.push('summary is empty');
  return fail;
}
