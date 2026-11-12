import { describe, expect, it } from 'vitest';
import { askLimits, ruledOut, ruledOutText, type DroppedView } from '@/features/outhere/dropped';
import { museWork } from '@/features/outhere/muse-work';
import type { PlanResponse } from '@/features/outhere/plan-api';
import type { PlanSuggestion } from '@/shared';

const NOW = new Date('2026-11-12T19:00:00Z');
const iso = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

const intent = {
  activities: ['food'], budgetMax: 15, windowStart: iso(0), windowEnd: iso(40), maxWalkMinutes: null,
  wantsFriends: true, openToNewPeople: true, vibe: null,
};
const limits = askLimits(intent);

const drop = (id: string, reason: DroppedView['reason'], extra: Partial<DroppedView> = {}): DroppedView =>
  ({ questId: id, title: id, venueName: `${id} venue`, emoji: '•', reason, text: `server ${reason}`, ...extra });

describe('ruledOutText', () => {
  it('walk: the minutes and the cap code compared them against', () => {
    expect(ruledOutText(drop('Ramen run', 'walk', { walkMinutes: 28 }), limits)).toBe('28 min walk, over your 25');
    expect(ruledOutText(drop('r', 'walk', { walkMinutes: 18 }), askLimits({ ...intent, maxWalkMinutes: 15 }))).toBe('18 min walk, over your 15');
  });

  it('budget: the price and your budget', () => {
    expect(ruledOutText(drop('Sushi', 'budget', { priceMax: 26 }), limits)).toBe('$26, over your $15');
    expect(ruledOutText(drop('Sushi', 'budget', { priceMax: 26 }), askLimits({ ...intent, budgetMax: null }))).toBe('$26, over your budget');
  });

  it('window: a start after the window names both times in Pacific time', () => {
    // 19:00Z is 11:00 AM PT; the window ends 11:40 AM
    expect(ruledOutText(drop('Pho', 'window', { startsAt: iso(90) }), limits)).toBe("starts 12:30 PM, after you're free till 11:40 AM");
    expect(ruledOutText(drop('Old', 'window', { startsAt: iso(-120) }), limits)).toBe('over before your free time starts');
  });

  it('late: the start and the walk that would miss it', () => {
    expect(ruledOutText(drop('Tacos', 'late', { startsAt: iso(5), walkMinutes: 12 }), limits)).toBe('starts 11:05 AM, before a 12 min walk gets you there');
  });

  it('missing numbers fall back to the server text, never a made-up number', () => {
    expect(ruledOutText(drop('a', 'walk'), limits)).toBe('server walk');
    expect(ruledOutText(drop('b', 'budget'), limits)).toBe('server budget');
    expect(ruledOutText(drop('c', 'late', { startsAt: iso(5) }), limits)).toBe('server late');
    expect(ruledOutText(drop('d', 'full'), limits)).toBe('server full');
  });
});

const all = [
  drop('volley', 'activity'),
  drop('pho', 'window', { startsAt: iso(90) }),
  drop('ramen', 'walk', { walkMinutes: 28 }),
  drop('thrift', 'activity'),
  drop('sushi', 'budget', { priceMax: 26 }),
  drop('tacos', 'window', { startsAt: iso(100) }),
  drop('ramen', 'walk', { walkMinutes: 28 }), // duplicate id
];

describe('ruledOut', () => {

  it('distance and price first, then time; off-topic plans are only counted', () => {
    const out = ruledOut(all, limits);
    expect(out.top.map((r) => r.questId)).toEqual(['ramen', 'sushi', 'pho']);
    expect(out.top[0].text).toBe('28 min walk, over your 25');
    expect(out.top[1].text).toBe('$26, over your $15');
    expect(out.more.map((r) => r.questId)).toEqual(['tacos']);
    expect(out.offTopic).toBe(2);
  });

  it('empty input', () => {
    expect(ruledOut([], limits)).toEqual({ top: [], more: [], offTopic: 0 });
  });
});

describe('museWork', () => {
  const sugg = { kind: 'join_quest', questId: 'q1', friendIds: [], title: 'Dumplings', emoji: '🥟', reason: 'r', bridge: null,
    startsAt: iso(25), travelMinutes: 9, fitsWindow: true, seatsLeft: 2, inviteDraft: null } as PlanSuggestion;
  const make = (over: Partial<PlanResponse['meta']> = {}): PlanResponse => ({
    intent, suggestions: [sugg, { ...sugg, questId: 'q2' }], summary: 's',
    meta: {
      mode: 'live', source: 'muse', contextSource: 'store', understood: true, candidateCount: 2, friendsChecked: 6,
      friendsFree: [{ firstName: 'Maya', freeUntil: iso(58) }, { firstName: 'Liam', freeUntil: iso(98) }],
      dropped: all, timings: { totalMs: 1200 }, ...over,
    },
  });

  it('header counts each plan once (2 fit + 6 unique drops), plus the friends checked', () => {
    const w = museWork(make(), 'muse', NOW)!;
    expect(w.checked).toBe('Checked 8 plans and 6 friends');
    expect(w.fit).toBe('2 fit');
    expect(w.read).toEqual(['food', '40 min', 'under $15', 'up to 25 min walk']);
    expect(w.friends).toBe('Free then: Maya till 11:58 AM, Liam till 12:38 PM');
    expect(w.rank).toBe('Muse ranked 2 of 2 and explained why · 1.2 s');
  });

  it('one friend, no friends, and an older response without friendsChecked', () => {
    expect(museWork(make({ friendsFree: [{ firstName: 'Maya', freeUntil: iso(58) }] }), 'muse', NOW)!.friends).toBe('Maya is free till 11:58 AM');
    expect(museWork(make({ friendsFree: [] }), 'muse', NOW)!.friends).toBe('None of your friends are free then');
    expect(museWork(make({ friendsFree: [], friendsChecked: 0 }), 'muse', NOW)!.friends).toBeNull();
    expect(museWork(make({ friendsChecked: undefined }), 'muse', NOW)!.checked).toBe('Checked 8 plans');
  });

  it('not understood: nothing to show', () => {
    expect(museWork(make({ understood: false }), 'muse', NOW)).toBeNull();
  });

  it('mock ranking says so', () => {
    const w = museWork(make(), 'mock', NOW)!;
    expect(w.rank).toMatch(/^Sorted offline by who's free, interests, walk/);
    // ✨ Muse goes only on a line the live model wrote
    expect(w.rankByMuse).toBe(false);
    expect(museWork(make(), 'fallback', NOW)!.rankByMuse).toBe(false);
    expect(museWork(make(), 'muse', NOW)!.rankByMuse).toBe(true);
    expect(w.checked).not.toMatch(/Muse/);
  });
});
