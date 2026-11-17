import { describe, expect, it } from 'vitest';
import type { Quest } from '@/shared';
import { walkPlan } from './useWalkTogether';

const NOW = Date.parse('2026-11-13T18:00:00Z');
const at = (min: number) => new Date(NOW + min * 60_000).toISOString();
const q = (id: string, startMin: number, members: string[], extra: Partial<Quest> = {}) =>
  ({ id, memberIds: members, status: 'open', startsAt: at(startMin), endsAt: at(startMin + 90), ...extra }) as Quest;

describe('walkPlan', () => {
  it('picks the plan you are walking to', () => {
    expect(walkPlan([q('a', 5, ['me', 'j']), q('b', 50, ['me', 'j'])], 'me', 'b', NOW)?.id).toBe('b');
  });
  it('else the soonest joined plan with someone else, starting within the hour', () => {
    expect(walkPlan([q('late', 90, ['me', 'j']), q('solo', 1, ['me']), q('soon', 20, ['me', 'j'])], 'me', null, NOW)?.id).toBe('soon');
  });
  it('ignores plans you did not join, done or ended ones', () => {
    expect(walkPlan([q('x', 5, ['j', 'k']), q('d', 5, ['me', 'j'], { status: 'done' }), q('e', -200, ['me', 'j'])], 'me', null, NOW)).toBeNull();
  });
});
