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

// The composer's time chips (PlanSheet DURATIONS).
type Chip = '15 min' | '30 min' | '1 hr' | '2 hr' | 'tonight';

type Step =
  | { kind: 'reset'; label: string }
  // "Just show I'm free" with no moods and no text: PlanSheet.justFree posts the note 'free'.
  | { kind: 'free'; label: string; as: string; note?: string; minutes: number }
  | { kind: 'busy'; label: string; as: string }
  // A composer ask: picked moods (their ask words), typed text, and the time chip, if any.
  | { kind: 'plan'; label: string; as: string; moods?: string[]; typed?: string; chip?: Chip }
  | { kind: 'freeWithMe'; label: string; as: string }
  | { kind: 'together'; label: string; as: string; with: string[] }
  | { kind: 'upNext'; label: string; as: string }
  | { kind: 'draft'; label: string; as: string; text: string }
  | { kind: 'intro'; label: string; as: string };

// The demo's scripted asks, in stage order (docs/DEMO_FLOW.md). Edit this list to match the
// exact taps and words used on stage: the cache only matches the same persona and the same
// words (case and extra spaces do not matter), and the plan keys also include which friends
// are free and from where, so each step writes availability the way the stage UI does:
// - free: "Just show I'm free" posts the note 'free' from the persona's shared location.
// - plan with a chip: PlanSheet sets the status first (note = moods + typed text, no time),
//   from the shared location, then asks Muse.
// - plan without a chip: PlanSheet asks Muse, then shareAvailability posts the note for the
//   window Muse resolved, from the plan's origin.
// Plan together keys on everyone's notes, so it is warmed right after both "show I'm free"
// taps (notes 'free') and again after the hungry asks (notes 'hungry').
export const STEPS: Step[] = [
  { kind: 'reset', label: 'presenter reset' },
  // 45 Minutes to Thrift (docs/DEMO_RUNSHEET.md): the exact stage ask, typed with no time chip,
  // right after a reset, as on stage (Maya's seeded free window is the only friend change).
  { kind: 'plan', label: 'Thrift: Alex boba ask (stage words)', as: 'alex', typed: "I've got 45 minutes. Can I grab boba with someone nearby?" },
  { kind: 'reset', label: 'presenter reset (after the thrift ask)' },
  // Scene 4: Alex's "I'm free", before anyone else is free.
  { kind: 'plan', label: "Alex: I'm free (typed)", as: 'alex', typed: 'free for an hour, want to try something new, under $20' },
  { kind: 'plan', label: 'Alex: hungry 30 min', as: 'alex', moods: ['hungry'], chip: '30 min' },
  { kind: 'plan', label: 'Alex: hungry 1 hr', as: 'alex', moods: ['hungry'], chip: '1 hr' },
  { kind: 'plan', label: 'Alex: hungry 2 hr', as: 'alex', moods: ['hungry'], chip: '2 hr' },
  { kind: 'plan', label: 'Alex: meet people 1 hr', as: 'alex', moods: ['meet people'], chip: '1 hr' },
  { kind: 'plan', label: 'Alex: live music tonight', as: 'alex', moods: ['live music'], chip: 'tonight' },
  { kind: 'plan', label: 'Alex: cheap 1 hr', as: 'alex', moods: ['something cheap'], chip: '1 hr' },
  { kind: 'plan', label: 'Alex: comics with someone', as: 'alex', typed: "i'm free and bored, want someone to go with who likes comics, 1 hr" },
  // Alex and Maya both tap "Just show I'm free", then the pre-check and plan together.
  { kind: 'free', label: 'Alex: show I am free', as: 'alex', minutes: 60 },
  { kind: 'free', label: 'Maya: show I am free', as: 'maya', minutes: 60 },
  { kind: 'freeWithMe', label: 'Alex: free with me (no Muse)', as: 'alex' },
  { kind: 'together', label: 'Alex: plan together (both just free)', as: 'alex', with: ['maya'] },
  // One open shared plan per group: reset closes it so the second plan together asks Muse
  // again (without DEMO_RESET_TOKEN it reuses the first plan). Then both are free again.
  { kind: 'reset', label: 'presenter reset (close shared plan)' },
  { kind: 'free', label: 'Alex: show I am free (again)', as: 'alex', minutes: 60 },
  { kind: 'free', label: 'Maya: show I am free (again)', as: 'maya', minutes: 60 },
  { kind: 'plan', label: "Alex: I'm free, Maya free (pre-check)", as: 'alex', typed: 'free for an hour, want to try something new, under $20' },
  { kind: 'plan', label: 'Alex: hungry 1 hr, Maya free', as: 'alex', moods: ['hungry'], chip: '1 hr' },
  { kind: 'plan', label: "Maya: I'm free, Alex free", as: 'maya', moods: ['hungry'], chip: '1 hr' },
  { kind: 'together', label: 'Alex: plan together (both hungry)', as: 'alex', with: ['maya'] },
  { kind: 'upNext', label: 'Alex: Up next (no Muse)', as: 'alex' },
  // Scene 2: one sentence becomes a plan draft (✨ Draft). Nothing is posted. The draft key
  // includes the places near the pin, so only a pin near DEMO_CENTER is served from the cache.
  { kind: 'draft', label: 'Alex: draft a plan', as: 'alex', text: 'comics open house at the cafe in 30 min, me + 3' },
  { kind: 'draft', label: 'Alex: draft boba', as: 'alex', text: 'boba after class at 4' },
  // Scene 5: an intro round for Alex (only where /api/intros exists).
  { kind: 'intro', label: 'Alex: intro round', as: 'alex' },
  { kind: 'busy', label: 'Alex: busy again', as: 'alex' },
  { kind: 'busy', label: 'Maya: busy again', as: 'maya' },
  { kind: 'reset', label: 'presenter reset' },
];

// ---------- the composer, as PlanSheet builds it ----------
// Copies of composeAsk, noteFor and the chip minutes in src/features/outhere/PlanSheet.tsx.
// Keep them in step with that file.

const CHIP_MIN: Record<Exclude<Chip, 'tonight'>, number> = { '15 min': 15, '30 min': 30, '1 hr': 60, '2 hr': 120 };
function minutesUntilTonight(): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
    .formatToParts(new Date());
  const h = Number(parts.find((x) => x.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((x) => x.type === 'minute')?.value ?? 0);
  return Math.max(60, 23 * 60 - (h * 60 + m));
}
const chipMinutes = (chip: Chip | undefined): number | null =>
  !chip ? null : chip === 'tonight' ? minutesUntilTonight() : CHIP_MIN[chip];
const mentionsTime = (t: string) => /\b\d+\s*(m|min|mins|minutes|h|hr|hrs|hour|hours)\b|\b(tonight|till|until|before|after)\b/i.test(t);
export function composeAsk(moods: string[], typed: string, chip: Chip | undefined): string {
  const t = typed.trim().replace(/[,\s]+$/, '');
  const parts = [...moods, t];
  if (chip && !mentionsTime(t)) parts.push(chip);
  return parts.filter(Boolean).join(', ');
}
export const noteFor = (moods: string[], typed: string): string => [...moods, typed.trim()].filter(Boolean).join(', ') || 'free';

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

// ---------- availability, the way the stage UI writes it ----------

/** The location FreeStatus posts from: the persona's shared location, else DEMO_CENTER. */
async function sharedLocation(as: string): Promise<{ lat: number; lng: number }> {
  const r = await call('GET', '/api/locations/me', { as });
  const loc = (r.body as { share?: { location?: { lat: number; lng: number } } | null })?.share?.location;
  return r.status < 400 && loc ? loc : DEMO_CENTER;
}

/** useMyStatus().setFree(0, minutes, note): free from a few seconds ago, from the shared location. */
async function setFree(as: string, minutes: number, note: string): Promise<Res> {
  const now = Date.now();
  return call('POST', '/api/availability', {
    as,
    body: {
      text: note.trim() || 'free', location: await sharedLocation(as),
      startsAt: new Date(now - 5_000).toISOString(), endsAt: new Date(now + minutes * 60_000).toISOString(),
    },
  });
}

/** plan-api shareAvailability: the window Muse resolved, from the plan's origin. */
async function shareAvailability(as: string, note: string, plan: unknown): Promise<void> {
  const p = plan as { intent?: { windowStart?: string; windowEnd?: string }; meta?: { origin?: { lat: number; lng: number } | null } };
  const startsAt = new Date(Math.max(Date.now(), Date.parse(p.intent?.windowStart ?? '') || Date.now()));
  const endsAt = new Date(Date.parse(p.intent?.windowEnd ?? '') || 0);
  if (!(endsAt > startsAt)) return;
  await call('POST', '/api/availability', {
    as, body: { text: note, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), location: p.meta?.origin ?? DEMO_CENTER },
  });
}

// ---------- steps ----------

async function run(step: Step): Promise<Res | 'skipped'> {
  switch (step.kind) {
    case 'reset':
      if (flag('--no-reset')) return 'skipped';
      if (!resetKey) return 'skipped';
      return call('POST', '/api/demo/reset', { as: 'alex', headers: { 'x-demo-key': resetKey } });
    case 'free':
      return setFree(step.as, step.minutes, step.note ?? 'free');
    case 'busy':
      return call('DELETE', '/api/availability', { as: step.as });
    case 'plan': {
      const moods = step.moods ?? [];
      const typed = step.typed ?? '';
      const note = noteFor(moods, typed);
      const picked = chipMinutes(step.chip);
      // A picked time sets the status before Muse answers (PlanSheet.submit).
      if (picked !== null) await setFree(step.as, picked, note);
      const r = await call('POST', '/api/muse/plan', { as: step.as, body: { text: composeAsk(moods, typed, step.chip) } });
      if (picked === null && r.status < 400) await shareAvailability(step.as, note, r.body);
      return r;
    }
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
