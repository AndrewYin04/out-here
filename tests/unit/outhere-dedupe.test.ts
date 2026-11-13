import { describe, expect, it } from 'vitest';
import { reasonCoversOverlap, summaryWithoutTop } from '@/features/outhere/dedupe';
import type { PlanSuggestion } from '@/shared';

// 23:44Z is 3:44 PM PT
const UNTIL = '2026-11-12T23:44:00.000Z';
const top = {
  kind: 'join_quest', questId: 'q1', friendIds: ['maya'], title: 'Dumplings before the rush', emoji: '🥟',
  reason: "Maya's craving dumplings and wants to try Dumpling Den. Free till 3:44 PM, and it's a 9 min walk.",
  bridge: "Maya's free till 3:44 PM and is into dumplings too.", startsAt: UNTIL, travelMinutes: 9,
  fitsWindow: true, seatsLeft: 2, inviteDraft: null,
} as PlanSuggestion;

describe('reasonCoversOverlap', () => {
  it('drops the overlap line when the reason names the friend and the same free-until time', () => {
    expect(reasonCoversOverlap(top.reason, ['Maya'], UNTIL, top.bridge)).toBe(true);
    expect(reasonCoversOverlap('You and Maya both like dumplings.', ['Maya'], UNTIL, null)).toBe(false);
    expect(reasonCoversOverlap(top.reason, ['Liam'], UNTIL, null)).toBe(false);
    expect(reasonCoversOverlap(top.reason, ['Maya', 'Liam'], UNTIL, null)).toBe(false);
  });
});

describe('summaryWithoutTop', () => {
  it('drops the sentences that repeat the top card', () => {
    const s = "2 plans fit your 40 min. Best bet: Dumplings before the rush. Maya's free till 3:44 PM and is into dumplings too.";
    expect(summaryWithoutTop(s, top, { name: 'Maya', freeUntil: UNTIL })).toBe('2 plans fit your 40 min.');
  });
  it('keeps a summary with nothing repeated, and returns empty when all of it repeats', () => {
    expect(summaryWithoutTop('Liam is free later tonight.', top)).toBe('Liam is free later tonight.');
    expect(summaryWithoutTop('Dumplings before the rush with Maya is the move.', top)).toBe('');
    expect(summaryWithoutTop('Nothing fits.', undefined)).toBe('Nothing fits.');
  });
});
