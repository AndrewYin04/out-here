// The plan pipeline reports each stage as it finishes (the streamed "I'm free" view shows them),
// in order, with the same numbers the final result carries.
import { afterEach, beforeEach, expect, it } from 'vitest';
import { plan } from '@/features/muse';
import type { PlanStageEvent } from '@/shared';

const saved = { ...process.env };
beforeEach(() => { process.env.MUSE_MOCK = '1'; process.env.MUSE_QUIET = '1'; process.env.MUSE_CACHE = '0'; });
afterEach(() => { process.env = { ...saved }; });

it('reports context, parse, candidates, rank and validate in order, matching the result', async () => {
  const stages: PlanStageEvent[] = [];
  const out = await plan({ text: 'hungry, 45 min, under $15', userId: 'alex', onStage: (e) => stages.push(e) });
  const order = stages.map((s) => s.stage);
  expect(order.slice(0, 3)).toEqual(['context', 'parse', 'candidates']);
  const cands = stages.find((s) => s.stage === 'candidates');
  expect(cands?.stage === 'candidates' && cands.fit).toBe(out.meta.candidateCount);
  if (out.meta.candidateCount > 0) {
    expect(order).toEqual(['context', 'parse', 'candidates', 'rank', 'validate']);
    const v = stages.at(-1)!;
    expect(v.stage === 'validate' && v.kept).toBe(out.plan.suggestions.length);
  }
  for (const s of stages) expect(s.ms).toBeGreaterThanOrEqual(0);
});

it('a listener that throws never breaks the plan', async () => {
  const out = await plan({ text: 'hungry, 45 min', userId: 'alex', onStage: () => { throw new Error('ui bug'); } });
  expect(out.plan.intent).toBeTruthy();
});

