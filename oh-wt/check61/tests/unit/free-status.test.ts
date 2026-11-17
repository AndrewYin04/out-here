import { describe, expect, it } from 'vitest';
import { freeStatus, freeStatusLabel, overlapWindow, rankFreeFriends, type FreeFriendInput } from '@/shared';
import { precheckFor } from '@/features/muse/validate';
import type { PlanCandidate } from '@/features/muse/candidates';

const now = new Date('2026-11-13T18:45:00.000Z'); // 10:45 AM PT
const at = (min: number) => new Date(now.getTime() + min * 60_000).toISOString();

describe('freeStatus', () => {
  it('is busy with no windows, or only ended ones', () => {
    expect(freeStatus([], now)).toEqual({ kind: 'busy' });
    expect(freeStatus([{ startsAt: at(-60), endsAt: at(-1) }], now)).toEqual({ kind: 'busy' });
  });
  it('is free till the end of a window that is open now', () => {
    expect(freeStatus([{ startsAt: at(-5), endsAt: at(40) }], now)).toEqual({ kind: 'free', until: at(40) });
  });
  it('is free later when the next window has not started', () => {
    expect(freeStatus([{ startsAt: at(60), endsAt: at(120) }], now)).toEqual({ kind: 'later', from: at(60), until: at(120) });
  });
  it('prefers the open window over a later one', () => {
    const s = freeStatus([{ startsAt: at(60), endsAt: at(120) }, { startsAt: at(-5), endsAt: at(30) }], now);
    expect(s.kind).toBe('free');
  });
  it('labels each state in demo time', () => {
    expect(freeStatusLabel({ kind: 'free', until: at(40) })).toBe('Free till 11:25 AM');
    expect(freeStatusLabel({ kind: 'later', from: at(75), until: at(135) })).toBe('Free at 12:00 PM');
    expect(freeStatusLabel({ kind: 'busy' })).toBe('Busy');
  });
});

describe('overlapWindow', () => {
  it('returns the shared part from now on', () => {
    expect(overlapWindow({ startsAt: at(-30), endsAt: at(40) }, { startsAt: at(-10), endsAt: at(50) }, now))
      .toEqual({ from: now.toISOString(), until: at(40) });
  });
  it('is null when the windows do not meet', () => {
    expect(overlapWindow({ startsAt: at(0), endsAt: at(30) }, { startsAt: at(30), endsAt: at(60) }, now)).toBeNull();
  });
});

describe('precheckFor', () => {
  const candidate = {
    friendOverlap: [{
      friendId: 'maya', availabilityId: 'a1', firstName: 'Maya', availabilityText: 'long lunch',
      freeFrom: at(-5), freeUntil: at(50), sharedWithViewer: ['dumplings'],
      status: 'craving dumplings 🥟 · lunch break for ~45 min', sharedWithQuest: ['dumplings'], travelMinutes: 6,
    }],
  } as unknown as PlanCandidate;

  it('answers likely down from what the friend shared, thought only', () => {
    expect(precheckFor(candidate, ['maya'])).toEqual([{
      friendId: 'maya', verdict: 'likely_down', freeUntil: at(50),
      because: ['free till 11:35 AM', 'likes dumplings', 'craving dumplings 🥟'],
    }]);
  });
  it('never lists a friend who did not pass the candidate check', () => {
    expect(precheckFor(candidate, ['busy-friend'])).toEqual([]);
  });
});

describe('rankFreeFriends', () => {
  const f = (id: string, from: number, until: number, shared: string[] = []): FreeFriendInput =>
    ({ id, from: at(from), until: at(until), friendUntil: at(until), sharedInterests: shared });
  const friendsOf: Record<string, string[]> = { maya: ['liam'], liam: ['maya', 'kai'], kai: ['liam'] };
  const areFriends = (a: string, b: string) => !!friendsOf[a]?.includes(b);
  const items = [f('kai', 60, 120), f('liam', 0, 90, ['running']), f('maya', 0, 50, ['dumplings', 'bands'])];

  it('ranks free-now friends with shared interests first, ties to whoever leaves first', () => {
    const { ranked } = rankFreeFriends(items, areFriends, now);
    expect(ranked.map((r) => r.id)).toEqual(['maya', 'liam', 'kai']);
    expect(ranked[2].freeNow).toBe(false);
  });
  it('groups the top friend with free friends who know them, not later ones', () => {
    expect(rankFreeFriends(items, areFriends, now).group).toEqual(['maya', 'liam']);
  });
  it('never groups two people when either said no, and never pairs the viewer with a no', () => {
    const noMayaLiam = rankFreeFriends(items, areFriends, now, {
      viewerId: 'alex', pair: (a, b) => ([a, b].sort().join() === 'liam,maya' ? 'one_no' : 'unknown'),
    });
    expect(noMayaLiam.group).toEqual(['maya']);
    const viewerNo = rankFreeFriends(items, areFriends, now, {
      viewerId: 'alex', pair: (a, b) => ([a, b].sort().join() === 'alex,maya' ? 'one_no' : 'unknown'),
    });
    expect(viewerNo.group[0]).toBe('liam');
    expect(viewerNo.ranked.map((r) => r.id)).toContain('maya'); // still listed: availability is already shared
  });
  it('ranks a mutual hang-again yes higher, but not above friends free now', () => {
    const base = rankFreeFriends(items, areFriends, now).ranked.find((r) => r.id === 'kai')!.score;
    const { ranked } = rankFreeFriends(items, areFriends, now, {
      viewerId: 'alex', pair: (a, b) => ([a, b].sort().join() === 'alex,kai' ? 'both_yes' : 'unknown'),
    });
    expect(ranked.find((r) => r.id === 'kai')!.score).toBe(base + 2);
    const tie = rankFreeFriends([f('liam', 0, 50, ['running']), f('maya', 0, 50, ['bands'])], () => false, now, {
      viewerId: 'alex', pair: (a, b) => ([a, b].sort().join() === 'alex,liam' ? 'both_yes' : 'unknown'),
    });
    expect(tie.ranked[0].id).toBe('liam');
  });
});
