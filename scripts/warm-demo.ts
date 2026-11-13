// Warms the Muse response cache with the demo's scripted asks (docs/MUSE_PREBAKE.md).
// Each ask goes through the real routes of a running server, as the right persona, so every
// stored answer is a genuine Muse output logged in muse_runs. Run it after the morning reseed:
//   npm run warm:demo -- --base https://<preview>.vercel.app --clear
//   npm run warm:demo                       local server at http://localhost:3000
// Flags:
//   --base <url>   server to warm (default WARM_BASE or http://localhost:3000)
//   --clear        delete every cached answer first, so all of them are from this run
//   --passes <n>   run the list n times (2 proves the second pass is served from the cache)
//   --no-enable    do not turn prebaked mode on at the end
//   --no-reset     skip the presenter reset before and after (needs DEMO_RESET_TOKEN)
//   --only <text>  run only steps whose label contains <text>
// Reads DEMO_RESET_TOKEN from the environment (npm run loads .env.local) and never prints it.
import { DEMO_CENTER } from '../src/shared/demo';
import { profileId } from '../src/shared/seed/ids';

type Step =
  | { kind: 'reset'; label: string }
  | { kind: 'free'; label: string; as: string; text: string; minutes: number }
  | { kind: 'busy'; label: string; as: string }
  | { kind: 'plan'; label: string; as: string; text: string }
  | { kind: 'freeWithMe'; label: string; as: string }
  | { kind: 'together'; label: string; as: string; with: string[] }
  | { kind: 'upNext'; label: string; as: string }
  | { kind: 'draft'; label: string; as: string; text: string }
  | { kind: 'intro'; label: string; as: string };

// The demo's scripted asks, in stage order (docs/DEMO_FLOW.md). Edit this list to match the
// exact words used on stage: the cache only matches the same persona and the same words
// (case and extra spaces do not matter). Composer asks are built like PlanSheet's composeAsk:
// the picked moods, the typed text, then the time chip ("15 min", "30 min", "1 hr", "2 hr", "tonight").
export const STEPS: Step[] = [
  { kind: 'reset', label: 'presenter reset' },
  // Scene 4: Alex's "I'm free", before anyone else is free.
  { kind: 'plan', label: "Alex: I'm free (typed)", as: 'alex', text: 'free for an hour, want to try something new, under $20' },
  { kind: 'plan', label: 'Alex: hungry 30 min', as: 'alex', text: 'hungry, 30 min' },
  { kind: 'plan', label: 'Alex: hungry 1 hr', as: 'alex', text: 'hungry, 1 hr' },
  { kind: 'plan', label: 'Alex: hungry 2 hr', as: 'alex', text: 'hungry, 2 hr' },
  { kind: 'plan', label: 'Alex: meet people 1 hr', as: 'alex', text: 'meet people, 1 hr' },
  { kind: 'plan', label: 'Alex: live music tonight', as: 'alex', text: 'live music, tonight' },
  { kind: 'plan', label: 'Alex: cheap 1 hr', as: 'alex', text: 'something cheap, 1 hr' },
  { kind: 'plan', label: 'Alex: comics with someone', as: 'alex', text: "i'm free and bored, want someone to go with who likes comics, 1 hr" },
  // Alex and Maya both say they are free ("Just show I'm free"), then the pre-check and plan together.
  { kind: 'free', label: 'Alex: show I am free', as: 'alex', text: 'free, want to try something new', minutes: 60 },
  { kind: 'free', label: 'Maya: show I am free', as: 'maya', text: 'craving dumplings', minutes: 60 },
  { kind: 'freeWithMe', label: 'Alex: free with me (no Muse)', as: 'alex' },
  { kind: 'plan', label: "Alex: I'm free, Maya free (pre-check)", as: 'alex', text: 'free for an hour, want to try something new, under $20' },
  { kind: 'plan', label: 'Alex: hungry 1 hr, Maya free', as: 'alex', text: 'hungry, 1 hr' },
  { kind: 'plan', label: "Maya: I'm free, Alex free", as: 'maya', text: 'hungry, 1 hr' },
  { kind: 'together', label: 'Alex: plan together with Maya', as: 'alex', with: ['maya'] },
  { kind: 'upNext', label: 'Alex: Up next (no Muse)', as: 'alex' },
  // Scene 2: one sentence becomes a plan draft (✨ Draft). Nothing is posted.
  { kind: 'draft', label: 'Alex: draft a plan', as: 'alex', text: 'comics open house at the cafe in 30 min, me + 3' },
  { kind: 'draft', label: 'Alex: draft boba', as: 'alex', text: 'boba after class at 4' },
  // Scene 5: an intro round for Alex (only where /api/intros exists).
  { kind: 'intro', label: 'Alex: intro round', as: 'alex' },
  { kind: 'busy', label: 'Alex: busy again', as: 'alex' },
  { kind: 'busy', label: 'Maya: busy again', as: 'maya' },
  { kind: 'reset', label: 'presenter reset' },
];

// ---------- args ----------

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const base = (value('--base') ?? process.env.WARM_BASE ?? 'http://localhost:3000').replace(/\/+$/, '');
const passes = Math.max(1, Number(value('--passes') ?? 1) || 1);
const only = value('--only')?.toLowerCase();
const resetKey = process.env.DEMO_RESET_TOKEN?.trim() || null;

// ---------- http ----------

type Res = { status: number; ms: number; body: unknown; headers: Headers };

async function call(method: string, path: string, opts: { as?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Res> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.as) headers['x-persona'] = opts.as;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const t = performance.now();
  const res = await fetch(`${base}${path}`, {
    method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(90_000),
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, ms: Math.round(performance.now() - t), body, headers: res.headers };
}

type Stats = { prebaked: boolean; store: string; mode: string; entries: number; runs: { live: number; cached: number; failed: number; mock: number } };

async function stats(since: string): Promise<Stats | null> {
  try {
    const r = await call('GET', `/api/muse/prebake?since=${encodeURIComponent(since)}`);
    return r.status === 200 ? (r.body as Stats) : null;
  } catch {
    return null;
  }
}

const errText = (r: Res) => {
  const e = (r.body as { error?: unknown })?.error;
  return `HTTP ${r.status}${typeof e === 'string' ? `: ${e.slice(0, 80)}` : ''}`;
};

// ---------- steps ----------

async function run(step: Step): Promise<Res | 'skipped'> {
  switch (step.kind) {
    case 'reset':
      if (flag('--no-reset')) return 'skipped';
      if (!resetKey) return 'skipped';
      return call('POST', '/api/demo/reset', { as: 'alex', headers: { 'x-demo-key': resetKey } });
    case 'free': {
      const now = Date.now();
      return call('POST', '/api/availability', {
        as: step.as,
        body: { text: step.text, startsAt: new Date(now).toISOString(), endsAt: new Date(now + step.minutes * 60_000).toISOString(), location: DEMO_CENTER },
      });
    }
    case 'busy':
      return call('DELETE', '/api/availability', { as: step.as });
    case 'plan':
      return call('POST', '/api/muse/plan', { as: step.as, body: { text: step.text } });
    case 'freeWithMe':
      return call('GET', '/api/availability/free-with-me', { as: step.as, headers: { 'x-outhere-fresh': '1' } });
    case 'together':
      return call('POST', '/api/together', { as: step.as, body: { friendIds: step.with.map(profileId) } });
    case 'upNext':
      return call('GET', '/api/quests/mine', { as: step.as, headers: { 'x-outhere-fresh': '1' } });
    case 'draft':
      return call('POST', '/api/muse/create-quest', { as: step.as, body: { text: step.text, location: DEMO_CENTER } });
    case 'intro': {
      const reset = await call('POST', '/api/intros/reset', { as: step.as, body: {} });
      if (reset.status === 404) return 'skipped';
      const r = await call('POST', '/api/intros/run', { as: step.as, body: {} });
      await call('POST', '/api/intros/reset', { as: step.as, body: {} });
      return r;
    }
  }
}

const MUSE_STEPS = new Set<Step['kind']>(['plan', 'together', 'draft', 'intro']);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const before = await stats(new Date().toISOString());
  if (!before) {
    console.error(`No /api/muse/prebake at ${base}. Is the server running this branch?`);
    process.exit(2);
  }
  console.log(`warm:demo -> ${base}  store=${before.store} mode=${before.mode} prebaked=${before.prebaked} entries=${before.entries}`);
  if (before.mode === 'mock') console.log('NOTE: the server is in mock mode, so nothing is cached (only live Muse answers are stored).');
  if (!resetKey && !flag('--no-reset')) console.log('NOTE: DEMO_RESET_TOKEN is not set: presenter resets are skipped, so a second pass reuses the open shared plan.');

  const adminHeaders = resetKey ? { 'x-demo-key': resetKey } : undefined;
  if (flag('--clear')) {
    const r = await call('POST', '/api/muse/prebake', { body: { clear: true }, headers: adminHeaders });
    console.log(r.status === 200 ? `cleared ${(r.body as { cleared?: number }).cleared ?? 0} cached answers` : `clear failed: ${errText(r)}`);
  }

  const total = { live: 0, cached: 0, failed: 0, slow: 0 };
  for (let pass = 1; pass <= passes; pass++) {
    console.log(`\npass ${pass}/${passes}`);
    console.log(`${'step'.padEnd(42)} ${'ms'.padStart(6)}  result`);
    for (const step of STEPS) {
      if (only && !step.label.toLowerCase().includes(only)) continue;
      const since = new Date(Date.now() - 50).toISOString();
      let out: Res | 'skipped';
      try {
        out = await run(step);
      } catch (err) {
        console.log(`${step.label.padEnd(42)} ${'-'.padStart(6)}  error: ${String((err as Error)?.message ?? err).slice(0, 80)}`);
        continue;
      }
      if (out === 'skipped') {
        console.log(`${step.label.padEnd(42)} ${'-'.padStart(6)}  skipped`);
        continue;
      }
      let result = out.status >= 400 ? errText(out) : 'ok';
      if (MUSE_STEPS.has(step.kind) && out.status < 400) {
        await sleep(300); // runs are logged in the background just after the response
        const s = await stats(since);
        if (s) {
          const { live, cached, failed } = s.runs;
          total.live += live; total.cached += cached; total.failed += failed;
          result = live + cached + failed === 0
            ? 'no Muse call (code answered, or an open shared plan was reused)'
            : cached > 0 && live === 0 && failed === 0
              ? `served from cache (${cached} cached)`
              : [
                  live ? `${live} live -> now cached` : null,
                  cached ? `${cached} cached` : null,
                  failed ? `${failed} FAILED/fallback rows (not cached)` : null,
                ].filter(Boolean).join(', ');
        }
        const header = out.headers.get('x-muse-cache');
        if (header) result += `  [x-muse-cache: ${header}]`;
        if (out.ms > 1000) total.slow++;
      }
      console.log(`${step.label.padEnd(42)} ${String(out.ms).padStart(6)}  ${result}`);
    }
    // Prebaked mode goes on after every pass, so the next pass (or the next run) reads the cache first.
    if (!flag('--no-enable')) {
      const r = await call('POST', '/api/muse/prebake', { body: { on: true }, headers: adminHeaders });
      console.log(r.status === 200 ? 'prebaked mode: ON (cached answers are served first)' : `prebaked mode NOT turned on: ${errText(r)}`);
    }
  }
  const after = await stats(new Date().toISOString());
  console.log(`totals: ${total.live} live, ${total.cached} cached, ${total.failed} failed; entries in cache: ${after?.entries ?? '?'}; prebaked=${after?.prebaked ?? '?'}`);
  if (total.failed > 0) console.log('Some Muse calls failed or fell back to code: run it again to fill those keys.');
}

main().catch((err) => {
  console.error(String((err as Error)?.message ?? err));
  process.exit(1);
});
