import { describe, expect, it } from 'vitest';
import { museSteps } from '@/features/outhere/muse-steps';
import type { DroppedView } from '@/features/outhere/dropped';
import type { PlanResponse } from '@/features/outhere/plan-api';
import type { PlanSuggestion } from '@/shared';

const NOW = new Date('2026-11-12T19:00:00Z');
const iso = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

const drop = (id: string, reason: DroppedView['reason']): DroppedView =>
  ({ questId: id, title: id, venueName: id, emoji: '•', reason, text: '' });

const sugg = { kind: 'join_quest', questId: 'q1', friendIds: [], title: 'Dumplings', emoji: '🥟', reason: 'r', bridge: null,
  startsAt: iso(25), travelMinutes: 9, fitsWindow: true, seatsLeft: 2, inviteDraft: null } as PlanSuggestion;

function make(over: Partial<PlanResponse['meta']> = {}, suggestions: PlanSuggestion[] = [sugg, { ...sugg, questId: 'q2' }]): PlanResponse {
  return {
    intent: {
      activities: ['food'], budgetMax: 15, windowStart: iso(0), windowEnd: iso(40), maxWalkMinutes: null,
      wantsFriends: true, openToNewPeople: true, vibe: null,
    },
    suggestions,
    summary: 's',
    meta: {
      mode: 'live', source: 'muse', contextSource: 'store', understood: true, candidateCount: 2,
      friendsFree: [{ firstName: 'Maya', freeUntil: '2026-11-13T02:00:00Z' }],
      dropped: [
        drop('a', 'walk'), drop('b', 'walk'), drop('c', 'walk'), drop('d', 'budget'), drop('e', 'budget'),
        drop('f', 'full'), drop('g', 'already_member'),
      ],
      timings: { totalMs: 4600 },
      ...over,
    },
  };
}

const texts = (p: PlanResponse, s: 'muse' | 'fallback' | 'mock' = 'muse') => museSteps(p, s, NOW).map((x) => x.text);

describe('museSteps', () => {
  it('live plan: intent, friend, counts, ranking with time', () => {
    expect(texts(make())).toEqual([
      'Got it: food · 40 min · under $15',
      'Maya is free till 6:00 PM',
      'Checked 9 plans: 2 fit · 3 too far · 2 over budget · 1 full · 1 other',
      'Muse ranked 2 of 2 and explained why · 4.6 s',
    ]);
  });

  it('nothing fits: plans and rank steps are muted', () => {
    const steps = museSteps(make({ candidateCount: 0 }, []), 'muse', NOW);
    expect(steps[2]).toMatchObject({ text: 'Checked 7 plans: 0 fit · 3 too far · 2 over budget · 1 full · 1 other', tone: 'muted' });
    // a friend is free, so the draft card takes over below
    expect(steps[3]).toMatchObject({ text: 'Nothing posted fits, so Muse drafted a plan with a free friend', tone: 'ok' });
    const alone = museSteps(make({ candidateCount: 0, friendsFree: [] }, []), 'muse', NOW);
    expect(alone[3]).toMatchObject({ text: 'Nothing left to rank', tone: 'muted' });
  });

  it('not understood: one muted step only', () => {
    const steps = museSteps(make({ understood: false }), 'muse', NOW);
    expect(steps).toHaveLength(1);
    expect(steps[0].tone).toBe('muted');
  });

  it('fallback and mock say so honestly', () => {
    expect(texts(make(), 'fallback')[3]).toMatch(/^Muse didn't answer in time/);
    expect(texts(make(), 'mock')[3]).toMatch(/^Ranked offline \(mock\)/);
  });

  it('friends: none, two, many', () => {
    expect(texts(make({ friendsFree: [] }))[1]).toBe('No friends free in that window');
    const f = (n: string) => ({ firstName: n, freeUntil: iso(60) });
    expect(texts(make({ friendsFree: [f('Maya'), f('Sam')] }))[1]).toBe('Maya and Sam are free');
    expect(texts(make({ friendsFree: [f('Maya'), f('Sam'), f('Nina')] }))[1]).toBe('Maya, Sam +1 are free');
  });

  it('long window shows an end time; walk cap shows when set', () => {
    const p = make();
    p.intent = { ...p.intent, windowEnd: '2026-11-13T02:00:00Z', maxWalkMinutes: 10, budgetMax: null };
    expect(texts(p)[0]).toBe('Got it: food · till 6:00 PM · ≤10 min walk');
  });

  it('constraint reasons come before "not what you asked"; up to three are named', () => {
    const many = [...Array(11)].map((_, i) => drop(`x${i}`, 'activity'));
    const p = make({ dropped: [...many, drop('w1', 'window'), drop('w2', 'late'), drop('m', 'already_member')] });
    expect(texts(p)[2]).toBe('Checked 16 plans: 2 fit · 2 wrong time · 11 not what you asked · 1 other');
  });

  it('a near-zero time (dev cache) is left out', () => {
    expect(texts(make({ timings: { totalMs: 3 } }))[3]).toBe('Muse ranked 2 of 2 and explained why');
  });

  it('older response without the new fields still renders', () => {
    const p = make({ candidateCount: undefined, friendsFree: undefined, timings: undefined, understood: undefined });
    expect(texts(p)).toHaveLength(4);
    expect(texts(p)[3]).toBe('Muse ranked 2 of 2 and explained why');
  });
});
