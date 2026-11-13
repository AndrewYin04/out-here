// Runs the Muse plan fixtures (src/features/muse/fixtures/plan.json) against the real Muse API
// and reports pass/fail per case with latency. Usage:
//   npm run eval:muse:plan                     all cases, real API (needs MUSE_API_KEY in .env.local)
//   npm run eval:muse:plan -- --only demo-hungry-40
//   node --import tsx scripts/eval-muse.mjs --allow-mock   wiring check without a key
// Answers are cached (muse_cache, or .cache/muse without Supabase) and read first; pass --fresh to skip the cache.
// In live mode a case also FAILS when any step fell back to code (meta.source "fallback",
// models.parse or models.rank "heuristic"): a silent fallback must never count as a pass.
// Writes .verify/eval-muse-plan.json (gitignored). Never prints keys or prompts.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const allowMock = args.includes('--allow-mock');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
if (args.includes('--fresh')) process.env.MUSE_CACHE = '0';
else process.env.MUSE_PREBAKED ??= '1';
process.env.MUSE_QUIET = '1';

if (!allowMock) {
  delete process.env.MUSE_MOCK;
  const missing = ['MUSE_API_KEY', 'MUSE_BASE_URL'].filter((k) => !process.env[k]);
  if (missing.length) {
    for (const k of missing) console.error(`${k}: MISSING`);
    console.error('Run through npm run eval:muse:plan so .env.local is loaded, or pass --allow-mock.');
    process.exit(2);
  }
}

const { plan, isMockMode } = await import('../src/features/muse/index.ts');
const { checkPlanFixture, planFixtures, questKey } = await import('../src/features/muse/fixtures/check.ts');

const live = !isMockMode();
const now = new Date(planFixtures.now);
const cases = planFixtures.cases.filter((c) => !only || c.id === only);
if (cases.length === 0) {
  console.error(`no fixture with id ${only}`);
  process.exit(2);
}
console.log(`Muse plan eval: ${cases.length} cases, mode ${isMockMode() ? 'MOCK' : 'LIVE'}, now ${planFixtures.now}`);

const results = [];
for (const f of cases) {
  const t0 = Date.now();
  let out = null;
  let failures;
  try {
    out = await plan({ text: f.text, userId: f.viewer, now });
    failures = checkPlanFixture(f, out, now);
    if (live) {
      const m = out.meta;
      if (m.source !== 'muse') failures.push(`source is ${m.source}, expected muse`);
      if (m.models.parse === 'heuristic') failures.push(`parse fell back: ${m.parseError ?? 'unknown'}`);
      if (m.models.rank === 'heuristic' || m.rankFallback) failures.push(`rank fell back: ${m.rankError ?? 'unknown'}`);
    }
  } catch (err) {
    failures = [`threw: ${String(err?.message ?? err).slice(0, 160)}`];
  }
  const ms = Date.now() - t0;
  const picks = out ? out.plan.suggestions.map((s) => questKey(s.questId) ?? '?').join(', ') || '(none)' : '(error)';
  const t = out?.meta.timings;
  const timing = t ? `parse ${t.parseMs}ms rank ${t.rankMs}ms total ${t.totalMs}ms` : `${ms}ms`;
  const flags = out ? [out.meta.source, out.meta.models.parse, out.meta.models.rank, `summary:${out.meta.summarySource}`, out.meta.summaryIssue].filter(Boolean).join(' / ') : '';
  console.log(`${failures.length ? 'FAIL' : 'PASS'}  ${f.id.padEnd(26)} ${timing.padEnd(40)} -> ${picks}  [${flags}]`);
  for (const x of failures) console.log(`        - ${x}`);
  if (out && failures.length) console.log(`        summary: ${out.plan.summary.slice(0, 160)}`);
  results.push({
    id: f.id, text: f.text, pass: failures.length === 0, failures, picks,
    timings: t ?? null, models: out?.meta.models ?? null, rankFallback: out?.meta.rankFallback ?? null,
    rankError: out?.meta.rankError ?? null, parseError: out?.meta.parseError ?? null,
    source: out?.meta.source ?? null, summarySource: out?.meta.summarySource ?? null,
    summaryIssue: out?.meta.summaryIssue ?? null, summary: out?.plan.summary ?? null,
  });
}

const passed = results.filter((r) => r.pass).length;
const totals = results.map((r) => r.timings?.totalMs).filter((x) => typeof x === 'number').sort((a, b) => a - b);
const p50 = totals.length ? totals[Math.floor(totals.length / 2)] : null;
console.log(`\n${passed}/${results.length} passed. Median total latency: ${p50 ?? 'n/a'} ms.`);

try {
  mkdirSync(join(root, '.verify'), { recursive: true });
  writeFileSync(
    join(root, '.verify', 'eval-muse-plan.json'),
    JSON.stringify({ at: new Date().toISOString(), mode: isMockMode() ? 'mock' : 'live', passed, total: results.length, results }, null, 2),
  );
  console.log('Wrote .verify/eval-muse-plan.json');
} catch {
  // report file is optional
}
process.exit(passed === results.length ? 0 : 1);
