import { describe, expect, it } from 'vitest';
import type { ReactionCounts } from '@/shared';
import { applyReaction, audienceLabel, commentTime, compactCount, shortTime, topReactions, totalReactions } from './format';

const zero: ReactionCounts = { like: 0, love: 0, care: 0, haha: 0, wow: 0, sad: 0, angry: 0 };
const now = new Date('2026-11-12T12:00:00Z');

describe('feed format', () => {
  it('formats short post times like Facebook', () => {
    expect(shortTime('2026-11-12T11:59:30Z', now)).toBe('Just now');
    expect(shortTime('2026-11-12T11:55:00Z', now)).toBe('5m');
    expect(shortTime('2026-11-12T09:00:00Z', now)).toBe('3h');
    expect(shortTime('2026-11-10T12:00:00Z', now)).toBe('2d');
    expect(shortTime('2026-11-01T12:00:00Z', now)).toBe('November 1');
    expect(shortTime('2025-11-01T12:00:00Z', now)).toBe('November 1, 2025');
  });

  it('formats comment times in weeks after 7 days', () => {
    expect(commentTime('2026-10-29T12:00:00Z', now)).toBe('2w');
  });

  it('applies a reaction change to the counts', () => {
    const c = { ...zero, like: 2, love: 1 };
    expect(applyReaction(c, null, 'love')).toMatchObject({ like: 2, love: 2 });
    expect(applyReaction(c, 'like', 'haha')).toMatchObject({ like: 1, haha: 1 });
    expect(applyReaction(c, 'love', null)).toMatchObject({ love: 0 });
    expect(applyReaction(zero, 'like', null).like).toBe(0);
  });

  it('totals and ranks reactions', () => {
    const c = { ...zero, like: 1, love: 5, wow: 3, sad: 2 };
    expect(totalReactions(c)).toBe(11);
    expect(topReactions(c)).toEqual(['love', 'wow', 'sad']);
  });

  it('labels audiences and compacts counts', () => {
    expect(audienceLabel('public')).toBe('Public');
    expect(audienceLabel('list:abc', 'Close friends')).toBe('Close friends');
    expect(compactCount(999)).toBe('999');
    expect(compactCount(1200)).toBe('1.2K');
    expect(compactCount(25_400)).toBe('25K');
  });
});
