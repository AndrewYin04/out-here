import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { plan } from '@/features/muse';
import { checkPlanFixture, planFixtures } from '@/features/muse/fixtures/check';

const NOW = new Date(planFixtures.now);
const saved = { mock: process.env.MUSE_MOCK, quiet: process.env.MUSE_QUIET };

beforeAll(() => {
  process.env.MUSE_MOCK = '1';
  process.env.MUSE_QUIET = '1';
});
afterAll(() => {
  process.env.MUSE_MOCK = saved.mock;
  process.env.MUSE_QUIET = saved.quiet;
});

describe('Muse plan fixtures (mock mode)', () => {
  it('has at least 12 cases', () => {
    expect(planFixtures.cases.length).toBeGreaterThanOrEqual(12);
  });

  for (const f of planFixtures.cases) {
    it(`${f.id}: "${f.text}"`, async () => {
      const out = await plan({ text: f.text, userId: f.viewer, now: NOW });
      expect(checkPlanFixture(f, out, NOW)).toEqual([]);
      expect(out.plan.summary.startsWith('[mock] ')).toBe(true);
      expect(out.meta.mode).toBe('mock');
    });
  }
});
