// Muse Intros hardening (issue #28): a Muse turn that times out or 5xx's once is retried while
// the round deadline allows, one failing candidate never sinks the round, every intro Muse call
// is logged with route, model and latency, accepts are atomic (exactly one 'accepted' and one
// Muse note however two requests interleave), and no card quotes the other side's private
// "looking for" text.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { profileId, type Intro } from '@/shared';
import { MuseTimeoutError, onRun, setMuseTransport, type MuseRunRecord, type MuseTransport } from '@/features/muse';
import { createMemoryStore, newScope, runInScope, type DataStore } from '@/features/data/server';
import { CoreStore } from '@/features/data/core';
import { TABLE_KEYS, TABLE_NAMES, toRow } from '@/features/data/db';
import { buildMemoryDb } from '@/features/data/memory-store';
import { SupabaseBackend } from '@/features/data/supabase-store';
import { MIN_RETRY_MS, museWithRetry } from '@/features/intros/server/agents';
import { introProfileOf } from '@/features/intros/server/rules';
import { privacyGuard, privateTexts } from '@/features/intros/server/privacy';
import { listIntros, requestIntro, respondIntro, runIntroRound } from '@/features/intros/server/service';

const alex = profileId('alex');
const jordan = profileId('jordan');
const saved = { ...process.env };
let runs: MuseRunRecord[] = [];

beforeEach(() => {
  runs = [];
  onRun((r) => { runs.push(r); });
  process.env.MUSE_QUIET = '1';
});
afterEach(() => {
  process.env = { ...saved };
  setMuseTransport(null);
  onRun(() => {});
});

function live() {
  delete process.env.MUSE_MOCK;
  process.env.MUSE_API_KEY = 'test-key-not-real';
  process.env.MUSE_BASE_URL = 'http://127.0.0.1:9';
  process.env.MUSE_CACHE = '0';
  process.env.MUSE_QUIET = '1';
}
const mock = () => { process.env.MUSE_MOCK = '1'; };

const line = (content: string, key: string) => {
  const l = content.split('\n').find((x) => x.startsWith(`${key}: `));
  return l ? l.slice(key.length + 2) : '';
};

/**
 * A stand-in for live Muse: agent turns say something short; the judge scores 91 and echoes the
 * code-found facts as reasons, so a strong pair clears the bar exactly as with real Muse.
 * `judge` can override the judge's reply (to test the privacy guard).
 */
function fakeMuse(opts: {
  failWhen?: (req: Parameters<MuseTransport>[0], n: number) => Error | null;
  judge?: (factsA: string[], factsB: string[]) => Record<string, unknown>;
} = {}) {
  const calls = { n: 0 };
  const t: MuseTransport = async (req) => {
    calls.n++;
    const err = opts.failWhen?.(req, calls.n);
    if (err) throw err;
    const content = req.messages.at(-1)!.content;
    if (req.schemaName === 'intro_judge') {
      const factsA = JSON.parse(line(content, 'factsForA') || '[]') as string[];
      const factsB = JSON.parse(line(content, 'factsForB') || '[]') as string[];
      const strong = factsA.length >= 2 && factsB.length >= 2;
      const reply = opts.judge?.(factsA, factsB) ?? {
        score: strong ? 91 : 60, reasonsA: factsA.slice(0, 3), reasonsB: factsB.slice(0, 3),
        summary: 'You share a connection and your agents said yes.',
        noteA: 'Your agents think this is worth a coffee.', noteB: 'Your agents think this is worth a coffee.',
      };
      return { content: JSON.stringify(reply), usage: { promptTokens: 100, completionTokens: 40 } };
    }
    return { content: JSON.stringify({ message: 'Sounds like a fit.', outcome: 'sees a fit' }), usage: { promptTokens: 50, completionTokens: 10 } };
  };
  setMuseTransport(t);
  return calls;
}

const status = (code: number) => Object.assign(new Error(`upstream ${code}`), { status: code });

// ---------------------------------------------------------------------------------------------
describe('timeouts and retries (live Muse, fake transport)', () => {
  const Z = z.object({ message: z.string(), outcome: z.string() });
  const opts = {
    schemaName: 'intro_agent_a', schema: Z, model: 'fast' as const, route: 'intros/click',
    jsonSchema: { type: 'object' }, messages: [{ role: 'user' as const, content: 'hi' }], mock: () => ({ message: 'm', outcome: 'o' }),
  };

  it('an agent turn that times out once is retried and succeeds', async () => {
    live();
    const calls = fakeMuse({ failWhen: (_r, n) => (n === 1 ? new MuseTimeoutError(8000) : null) });
    const r = await museWithRetry(opts, Date.now() + 30_000);
    expect(r.data.message).toBe('Sounds like a fit.');
    expect(calls.n).toBe(2);
  });

  it('a 5xx is retried once; a second failure is thrown', async () => {
    live();
    const calls = fakeMuse({ failWhen: () => status(503) });
    await expect(museWithRetry(opts, Date.now() + 30_000)).rejects.toThrow();
    expect(calls.n).toBe(2);
  });

  it('a 4xx is not retried', async () => {
    live();
    const calls = fakeMuse({ failWhen: () => status(400) });
    await expect(museWithRetry(opts, Date.now() + 30_000)).rejects.toThrow();
    expect(calls.n).toBe(1);
  });

  it('no retry when the round deadline is too close', async () => {
    live();
    const calls = fakeMuse({ failWhen: () => new MuseTimeoutError(8000) });
    await expect(museWithRetry(opts, Date.now() + MIN_RETRY_MS - 500)).rejects.toBeInstanceOf(MuseTimeoutError);
    expect(calls.n).toBe(1);
  });

  it('a round whose first Muse call times out still makes the Alex -> Jordan intro', async () => {
    live();
    const calls = fakeMuse({ failWhen: (_r, n) => (n === 1 ? new MuseTimeoutError(8000) : null) });
    const r = await runIntroRound(createMemoryStore(), alex);
    expect(r.intro?.other.handle).toBe('jordan');
    expect(r.intro?.score).toBe(91);
    // 3 candidates x (4 turns + judge) plus the one retry.
    expect(calls.n).toBe(16);
  });

  it('a judge that times out once is retried', async () => {
    live();
    let judgeFails = 0;
    fakeMuse({
      failWhen: (req) => (req.schemaName === 'intro_judge' && judgeFails++ === 0 ? new MuseTimeoutError(8000) : null),
    });
    const r = await runIntroRound(createMemoryStore(), alex);
    expect(r.intro?.other.handle).toBe('jordan');
  });

  it('one candidate that always fails never sinks the round', async () => {
    live();
    // Every call that is not about Jordan times out, twice (so the retry fails too).
    fakeMuse({ failWhen: (req) => (req.messages.at(-1)!.content.includes('Jordan') ? null : new MuseTimeoutError(8000)) });
    const r = await runIntroRound(createMemoryStore(), alex);
    expect(r.intro?.other.handle).toBe('jordan');
    expect(r.considered).toBe(1);
  });

  it('every intro Muse call is logged with route, model and latency', async () => {
    live();
    fakeMuse({ failWhen: (_r, n) => (n === 1 ? new MuseTimeoutError(8000) : null) });
    await runIntroRound(createMemoryStore(), alex);
    expect(runs.length).toBe(16);
    for (const run of runs) {
      expect(run.route).toBe('intros/click');
      expect(run.model).toBe('muse-ember-1.0');
      expect(typeof run.latencyMs).toBe('number');
      expect(run.userId).toBe(alex);
      expect(run.mock).toBe(false);
    }
    expect(runs.filter((x) => !x.ok)).toHaveLength(1);
    expect(runs.filter((x) => x.schemaName === 'intro_judge')).toHaveLength(3);
    expect(runs.find((x) => x.schemaName === 'intro_judge' && x.ok)!.promptTokens).toBe(100);
  });
});

// ---------------------------------------------------------------------------------------------
async function proposed(store: DataStore) {
  const r = await runIntroRound(store, alex);
  expect(r.intro?.other.handle).toBe('jordan');
  return r.intro!.id;
}
const row = async (store: DataStore, id: string) => (await store.museContext()).view.db.intros.find((i) => i.id === id)!;
const museNotes = async (store: DataStore, threadId: string) => (await store.messages(alex, threadId)).filter((m) => m.kind === 'muse');
const notes = async (store: DataStore, who: string, re: RegExp) =>
  (await store.notifications(who)).notifications.filter((n) => n.type === 'intro' && re.test(n.text));

describe('atomic accept (memory store)', () => {
  beforeEach(mock);

  it('a double click on A\'s accept asks B once', async () => {
    const store = createMemoryStore();
    const id = await proposed(store);
    const [x, y] = await Promise.all([respondIntro(store, alex, id, true), respondIntro(store, alex, id, true)]);
    expect([x.intro.state, y.intro.state]).toEqual(['waiting', 'waiting']);
    expect((await row(store, id)).status).toBe('a_accepted');
    expect(await notes(store, jordan, /has an intro for you/)).toHaveLength(1);
  });

  it('a double click on B\'s accept connects once with one Muse note', async () => {
    const store = createMemoryStore();
    const id = await proposed(store);
    await respondIntro(store, alex, id, true);
    const [x, y] = await Promise.all([respondIntro(store, jordan, id, true), respondIntro(store, jordan, id, true)]);
    expect([x.intro.state, y.intro.state]).toEqual(['connected', 'connected']);
    const r = await row(store, id);
    expect(r.status).toBe('accepted');
    expect(await museNotes(store, r.threadId!)).toHaveLength(1);
    expect(await notes(store, alex, /are connected/)).toHaveLength(1);
  });

  for (const order of ['A then B', 'B then A'] as const) {
    it(`A re-clicking while B accepts (${order}) ends accepted once with one note`, async () => {
      const store = createMemoryStore();
      const id = await proposed(store);
      await respondIntro(store, alex, id, true);
      const a = () => respondIntro(store, alex, id, true);
      const b = () => respondIntro(store, jordan, id, true);
      await Promise.all(order === 'A then B' ? [a(), b()] : [b(), a()]);
      const r = await row(store, id);
      expect(r.status).toBe('accepted');
      expect(r.threadId).toBeTruthy();
      expect(await museNotes(store, r.threadId!)).toHaveLength(1);
      expect((await listIntros(store, alex)).intros[0].state).toBe('connected');
      expect((await listIntros(store, jordan)).intros[0].state).toBe('connected');
    });

    it(`B accepting while B passes (${order}) ends in exactly one outcome`, async () => {
      const store = createMemoryStore();
      const id = await proposed(store);
      await respondIntro(store, alex, id, true);
      const yes = () => respondIntro(store, jordan, id, true);
      const no = () => respondIntro(store, jordan, id, false);
      await Promise.all(order === 'A then B' ? [yes(), no()] : [no(), yes()]);
      const r = await row(store, id);
      if (r.status === 'accepted') {
        expect(await museNotes(store, r.threadId!)).toHaveLength(1);
      } else {
        expect(r.status).toBe('declined');
        expect(r.threadId).toBeNull();
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------
type Row = Record<string, unknown>;
/** supabase-js stand-in with UPDATE ... RETURNING (update().eq().select()). Writes apply in call order. */
class FakeSupabase {
  tables = new Map<string, Row[]>();
  constructor() {
    const db = buildMemoryDb();
    for (const k of TABLE_KEYS) this.tables.set(TABLE_NAMES[k], (db[k] as unknown as Row[]).map((r) => toRow(k, r)));
  }
  from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
    let rows: Row[] = []; let patch: Row = {}; let returning = false;
    let range: [number, number] | null = null;
    const b = {
      select() { if (op === 'select') op = 'select'; else returning = true; return b; },
      order() { return b; },
      range(from: number, to: number) { range = [from, to]; return b; },
      eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return b; },
      in(c: string, v: unknown[]) { filters.push((r) => v.includes(r[c])); return b; },
      insert(r: Row[]) { op = 'insert'; rows = r; return b; },
      upsert(r: Row[]) { op = 'upsert'; rows = r; return b; },
      update(p: Row) { op = 'update'; patch = p; return b; },
      delete() { op = 'delete'; return b; },
      then: <R,>(res: (v: { data: Row[] | null; error: null; count?: number }) => R) => Promise.resolve().then(() => {
        const all = this.tables.get(table) ?? [];
        const hit = (r: Row) => filters.every((f) => f(r));
        if (op === 'select') {
          const out = all.filter(hit).map((r) => ({ ...r }));
          return res({ data: range ? out.slice(range[0], range[1] + 1) : out, error: null, count: out.length });
        }
        if (op === 'insert' || op === 'upsert') this.tables.set(table, [...all, ...rows]);
        let changed: Row[] = [];
        if (op === 'update') {
          changed = all.filter(hit).map((r) => ({ ...r, ...patch }));
          this.tables.set(table, all.map((r) => (hit(r) ? { ...r, ...patch } : r)));
        }
        if (op === 'delete') this.tables.set(table, all.filter((r) => !hit(r)));
        return res({ data: returning ? changed : null, error: null });
      }),
    };
    return b;
  };
}

describe('atomic accept (Supabase backend, one working snapshot per request)', () => {
  beforeEach(mock);

  it('conditional update: the second of two identical transitions changes nothing', async () => {
    const fake = new FakeSupabase();
    const backend = new SupabaseBackend({ client: fake as never });
    const store = new CoreStore(backend);
    const id = await runInScope(newScope(true), () => proposed(store));
    const [x, y] = await Promise.all([
      runInScope(newScope(true), () => store.transitionIntro(id, 'proposed', { status: 'a_accepted' })),
      runInScope(newScope(true), () => store.transitionIntro(id, 'proposed', { status: 'a_accepted' })),
    ]);
    expect([x, y].sort()).toEqual([false, true]);
  });

  it('two simultaneous B accepts in separate requests: accepted once, one Muse note, both cards connected', async () => {
    const fake = new FakeSupabase();
    const store = new CoreStore(new SupabaseBackend({ client: fake as never }));
    const id = await runInScope(newScope(true), () => proposed(store));
    await runInScope(newScope(true), () => respondIntro(store, alex, id, true));
    const [x, y] = await Promise.all([
      runInScope(newScope(true), () => respondIntro(store, jordan, id, true)),
      runInScope(newScope(true), () => respondIntro(store, jordan, id, true)),
    ]);
    expect([x.intro.state, y.intro.state]).toEqual(['connected', 'connected']);
    const intro = fake.tables.get('intros')!.find((r) => r.id === id)!;
    expect(intro.status).toBe('accepted');
    const muse = fake.tables.get('messages')!.filter((m) => m.thread_id === intro.thread_id && m.kind === 'muse');
    expect(muse).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe('privacy: no card quotes the other side\'s looking-for before both accept', () => {
  async function privateOf(store: DataStore, id: string) {
    const { view } = await store.museContext();
    return privateTexts(introProfileOf(view, id));
  }
  const cardText = (c: Awaited<ReturnType<typeof listIntros>>['intros'][number]) =>
    [c.summary, ...c.reasons, ...c.myAgentLog.map((t) => t.text)].join(' | ').toLowerCase();

  it('mock round: Alex\'s and Jordan\'s proposed-state cards never contain the other\'s text', async () => {
    mock();
    const store = createMemoryStore();
    const id = await proposed(store);
    const jordanSecrets = await privateOf(store, jordan);
    const alexSecrets = await privateOf(store, alex);
    const a = (await listIntros(store, alex)).intros[0];
    for (const s of jordanSecrets) expect(cardText(a)).not.toContain(s.toLowerCase());
    await respondIntro(store, alex, id, true);
    const j = (await listIntros(store, jordan)).intros[0];
    expect(j.state).toBe('new');
    for (const s of alexSecrets) expect(cardText(j)).not.toContain(s.toLowerCase());
  });

  it('a live judge that quotes the other side gets paraphrased into a shared-interest reason', async () => {
    live();
    const store = createMemoryStore();
    const { view } = await store.museContext();
    const jl = introProfileOf(view, jordan).kinds.friendship.lookingFor;   // "friends for local shows and gig nights"
    const al = introProfileOf(view, alex).kinds.friendship.lookingFor;     // "people to go to local shows with"
    fakeMuse({
      judge: (factsA, factsB) => ({
        score: 91,
        reasonsA: [`Jordan is looking for ${jl}`, ...factsA.slice(0, 2)],
        reasonsB: [`Alex wants ${al}`, ...factsB.slice(0, 2)],
        summary: `Alex wants ${al} and Jordan wants ${jl}.`,
        noteA: `Jordan said they want ${jl}.`,
        noteB: `Alex said they want ${al}.`,
      }),
    });
    const r = await runIntroRound(store, alex);
    const a = r.intro!;
    expect(a.state).toBe('new');
    expect(cardText(a)).not.toContain(jl.toLowerCase());
    expect(cardText(a)).not.toContain('gig nights');
    expect(a.summary).toBe('Your agents agree Jordan would be a good intro for you.');
    // The quote became a reason built from words both sides wrote.
    expect(a.reasons).toContain("You're both looking for people into local shows");
    await respondIntro(store, alex, a.id, true);
    const j = (await listIntros(store, jordan)).intros[0];
    expect(cardText(j)).not.toContain(al.toLowerCase());
    // The stored summary (later Muse's note to both) was replaced too.
    expect((await row(store, a.id)).summary).not.toContain(al);
    expect((await row(store, a.id)).summary).not.toContain(jl);
  });

  it('an on-request looking-for text is kept from the other side', async () => {
    live();
    const store = createMemoryStore();
    const ask = 'friends for vinyl swaps and gig nights';
    fakeMuse({
      judge: (factsA, factsB) => ({
        score: 91, reasonsA: factsA.slice(0, 3), reasonsB: [`Alex is after ${ask}`, ...factsB.slice(0, 2)],
        summary: 'You share a connection.', noteA: 'Worth a coffee.', noteB: `Alex wants ${ask}.`,
      }),
    });
    const r = await requestIntro(store, alex, 'friendship', ask);
    expect(r.intro).not.toBeNull();
    const stored = await row(store, r.intro!.id) as Intro;
    expect([...(stored.reasonsB ?? []), stored.noteB].join(' ').toLowerCase()).not.toContain('vinyl swaps');
  });

  it('guard unit: own words and public facts pass, the other side\'s words do not', () => {
    const viewer = { interests: ['local bands'], bio: '', job: null } as never;
    const other = { interests: ['local bands', 'film photography'], bio: '', job: 'Product designer' } as never;
    const g = privacyGuard({
      viewer, seenOther: other,
      viewerIntro: { userId: 'x', kinds: { friendship: { on: true, lookingFor: 'people to go to local shows with' }, networking: { on: false, lookingFor: '' }, dating: { on: false, lookingFor: '' } }, datingPrefs: null, maxKm: 25, paused: false },
      secrets: ['friends for local shows and gig nights'],
    });
    expect(g.leaks("You're looking for people to go to local shows with")).toBe(false);
    expect(g.leaks('Jordan is into film photography')).toBe(false);
    expect(g.leaks('Jordan wants gig nights')).toBe(true);
    expect(g.leaks('Jordan wants friends for local shows and gig nights')).toBe(true);
    expect(g.reasons(['Jordan wants gig nights', 'You both love local bands'])).toEqual([
      "You're both looking for people into local shows", 'You both love local bands',
    ]);
  });

  it('a stored row that quotes private text is cleaned when the card is built', async () => {
    mock();
    const store = createMemoryStore();
    const id = await proposed(store);
    const r = await row(store, id);
    await store.updateIntro(id, {
      reasons: ['Jordan wants friends for local shows and gig nights', ...r.reasons],
      noteA: 'Jordan told Muse about gig nights.',
    });
    const a = (await listIntros(store, alex)).intros[0];
    expect(cardText(a)).not.toContain('gig nights');
    expect(a.summary).toBe('Your agents agree Jordan would be a good intro for you.');
  });
});
