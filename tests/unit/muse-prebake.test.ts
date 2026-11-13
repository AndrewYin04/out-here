// Prebaked Muse (docs/MUSE_PREBAKE.md): stable cache keys, cache hit and miss, the stage-timeout
// fallback, and muse_runs rows for live and cached calls. Uses an in-memory run store and a
// fake transport, so nothing touches the network.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  clearPrebakedMemo, createMemoryRunStore, museCacheKey, museJSON, normalizeVolatile, onRun, plan,
  setMuseTransport, setRunStore, type MuseRunRecord, type MuseRunStore, type MuseTransport,
} from '@/features/muse';
import { parsePrompt } from '@/features/muse/prompts/parse';
import { localLabel } from '@/features/muse/time';

const saved = { ...process.env };
const Z = z.object({ answer: z.string() });
const JSON_SCHEMA = { type: 'object', additionalProperties: false, properties: { answer: { type: 'string' } }, required: ['answer'] };
const usage = { promptTokens: 3, completionTokens: 2 };

let store: MuseRunStore;
let logged: MuseRunRecord[];
let calls: number;

function storeWithLog(): MuseRunStore {
  const inner = createMemoryRunStore();
  return { ...inner, logRun: async (r) => { logged.push(r); await inner.logRun(r); } };
}

const flush = () => new Promise((r) => setTimeout(r, 20));

function transport(answer: (n: number) => string, delayMs = 0): MuseTransport {
  return async ({ signal }) => {
    calls++;
    const n = calls;
    if (delayMs) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, delayMs);
        signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); });
      });
    }
    return { content: JSON.stringify({ answer: answer(n) }), usage };
  };
}

const ask = (text: string, nowLabel: string, extra: { timeoutMs?: number; deadline?: number } = {}) => museJSON({
  schemaName: 'test', schema: Z, jsonSchema: JSON_SCHEMA, model: 'fast', route: 'test', userId: 'u-alex',
  messages: [
    { role: 'system', content: `Current local time: ${nowLabel}. Reply with JSON.` },
    { role: 'user', content: text },
  ],
  cacheKey: { text: text.toLowerCase().trim() },
  mock: () => ({ answer: 'mocked' }),
  ...extra,
});

beforeEach(() => {
  delete process.env.MUSE_MOCK;
  delete process.env.MUSE_CACHE;
  delete process.env.MUSE_PREBAKED;
  delete process.env.MUSE_STAGE_TIMEOUT_MS;
  process.env.MUSE_API_KEY = 'test-key-not-real';
  process.env.MUSE_BASE_URL = 'http://127.0.0.1:9';
  process.env.MUSE_QUIET = '1';
  logged = [];
  calls = 0;
  store = storeWithLog();
  setRunStore(store);
  clearPrebakedMemo();
  onRun(() => {});
});
afterEach(() => {
  process.env = { ...saved };
  setMuseTransport(null);
  setRunStore(null);
  clearPrebakedMemo();
});

describe('cache key', () => {
  it('the same ask an hour later has the same key (clock removed)', () => {
    const at = new Date('2026-11-13T09:05:00-08:00');
    const later = new Date('2026-11-13T10:47:00-08:00');
    const key = (d: Date, text: string) => museCacheKey({
      route: 'muse/plan', schemaName: 'intent', model: 'muse-ember-1.0', effort: 'minimal', userId: 'u-alex',
      jsonSchema: JSON_SCHEMA, messages: parsePrompt({ text, nowLabel: localLabel(d) }), cacheKey: { text },
    });
    expect(localLabel(at)).not.toBe(localLabel(later));
    expect(key(at, 'hungry, 1 hr')).toBe(key(later, 'hungry, 1 hr'));
    expect(key(at, 'hungry, 1 hr')).not.toBe(key(at, 'hungry, 2 hr'));
  });

  it('ignores live numbers outside cacheKey, but not the persona, model or ordered ids', () => {
    const k = (over: Partial<Parameters<typeof museCacheKey>[0]> = {}) => museCacheKey({
      route: 'muse/plan', schemaName: 'plan', model: 'muse-ember-1.0', effort: 'minimal', userId: 'u-alex',
      jsonSchema: JSON_SCHEMA, cacheKey: { text: 'hungry', shortlist: [['q1', ['maya']], ['q2', []]] },
      messages: [{ role: 'system', content: 'rank' }, { role: 'user', content: '{"seatsLeft":2,"walkMin":9}' }],
      ...over,
    });
    expect(k({ messages: [{ role: 'system', content: 'rank' }, { role: 'user', content: '{"seatsLeft":1,"walkMin":11}' }] })).toBe(k());
    expect(k({ userId: 'u-maya' })).not.toBe(k());
    expect(k({ model: 'muse-spark-1.3' })).not.toBe(k());
    expect(k({ cacheKey: { text: 'hungry', shortlist: [['q2', []], ['q1', ['maya']]] } })).not.toBe(k());
    expect(k({ messages: [{ role: 'system', content: 'rank v2' }] })).not.toBe(k());
  });

  it('normalizes ISO times, the now label and 12-hour clocks only', () => {
    expect(normalizeVolatile('at 2026-11-13T18:45:00.000Z, Fri 10:45 AM, free till 4:50 PM, 17:00'))
      .toBe('at <iso>, <now>, free till <clock>, 17:00');
  });
});

describe('response cache', () => {
  it('prebaked: the second ask (an hour later on the clock) is served from the cache', async () => {
    process.env.MUSE_PREBAKED = '1';
    setMuseTransport(transport((n) => `live ${n}`));
    const first = await ask('Hungry, 1 hr', 'Fri 9:05 AM');
    const second = await ask('  hungry, 1 hr ', 'Fri 10:05 AM');
    expect(first).toMatchObject({ data: { answer: 'live 1' }, cached: false });
    expect(second).toMatchObject({ data: { answer: 'live 1' }, cached: true, cacheReason: 'prebaked' });
    expect(calls).toBe(1);
    expect(second.latencyMs).toBeLessThan(100);
  });

  it('misses on a different ask, and goes live when prebaked is off', async () => {
    process.env.MUSE_PREBAKED = '1';
    setMuseTransport(transport((n) => `live ${n}`));
    await ask('hungry, 1 hr', 'Fri 9:05 AM');
    const other = await ask('hungry, 2 hr', 'Fri 9:06 AM');
    expect(other).toMatchObject({ data: { answer: 'live 2' }, cached: false });
    process.env.MUSE_PREBAKED = '0';
    const off = await ask('hungry, 1 hr', 'Fri 9:07 AM');
    expect(off).toMatchObject({ data: { answer: 'live 3' }, cached: false });
  });

  it('the warm-up flag in the store turns prebaked on without the env var', async () => {
    setMuseTransport(transport((n) => `live ${n}`));
    await ask('hungry, 1 hr', 'Fri 9:05 AM');
    expect((await ask('hungry, 1 hr', 'Fri 9:06 AM')).cached).toBe(false);
    await store.setPrebakedFlag(true);
    clearPrebakedMemo();
    expect(await ask('hungry, 1 hr', 'Fri 9:07 AM')).toMatchObject({ cached: true, cacheReason: 'prebaked' });
  });

  it('MUSE_CACHE=0 turns the cache off', async () => {
    process.env.MUSE_PREBAKED = '1';
    process.env.MUSE_CACHE = '0';
    setMuseTransport(transport((n) => `live ${n}`));
    await ask('hungry, 1 hr', 'Fri 9:05 AM');
    expect((await ask('hungry, 1 hr', 'Fri 9:05 AM')).cached).toBe(false);
    expect(calls).toBe(2);
  });
});

describe('stage timeout fallback', () => {
  it('a live call slower than MUSE_STAGE_TIMEOUT_MS yields to the cached answer', async () => {
    process.env.MUSE_STAGE_TIMEOUT_MS = '100';
    setMuseTransport(transport((n) => `live ${n}`));
    await ask('hungry, 1 hr', 'Fri 9:05 AM');
    setMuseTransport(transport((n) => `slow ${n}`, 1500));
    const t = Date.now();
    const r = await ask('hungry, 1 hr', 'Fri 10:40 AM');
    expect(Date.now() - t).toBeLessThan(800);
    expect(r).toMatchObject({ data: { answer: 'live 1' }, cached: true, cacheReason: 'stage-timeout' });
  });

  it('with nothing cached, the slow live call is awaited as before', async () => {
    process.env.MUSE_STAGE_TIMEOUT_MS = '50';
    setMuseTransport(transport((n) => `slow ${n}`, 200));
    const r = await ask('hungry, 1 hr', 'Fri 9:05 AM');
    expect(r).toMatchObject({ data: { answer: 'slow 1' }, cached: false });
  });

  it('a failed live call yields to the cached answer', async () => {
    setMuseTransport(transport((n) => `live ${n}`));
    await ask('hungry, 1 hr', 'Fri 9:05 AM');
    setMuseTransport(async () => { throw Object.assign(new Error('bad gateway'), { status: 502 }); });
    const r = await ask('hungry, 1 hr', 'Fri 10:40 AM');
    expect(r).toMatchObject({ data: { answer: 'live 1' }, cached: true, cacheReason: 'live-failed' });
  });

  it('a failed live call with nothing cached still throws', async () => {
    setMuseTransport(async () => { throw Object.assign(new Error('bad gateway'), { status: 502 }); });
    await expect(ask('hungry, 1 hr', 'Fri 10:40 AM')).rejects.toThrow(/bad gateway/);
  });
});

describe('muse_runs', () => {
  it('writes a row for the live call and one flagged cached for the cache hit', async () => {
    process.env.MUSE_PREBAKED = '1';
    setMuseTransport(transport((n) => `live ${n}`));
    await ask('hungry, 1 hr', 'Fri 9:05 AM');
    await ask('hungry, 1 hr', 'Fri 10:05 AM');
    await flush();
    expect(logged).toHaveLength(2);
    expect(logged[0]).toMatchObject({ route: 'test', model: 'muse-ember-1.0', ok: true, cached: false, promptTokens: 3 });
    expect(logged[1]).toMatchObject({ route: 'test', ok: true, cached: true, cacheReason: 'prebaked', output: { answer: 'live 1' } });
    expect(logged[0].inputHash).toBe(logged[1].inputHash);
    expect(JSON.stringify(logged)).not.toContain('test-key-not-real');
    const s = await store.stats('2000-01-01T00:00:00.000Z');
    expect(s).toMatchObject({ entries: 1, runs: { live: 1, cached: 1, failed: 0 } });
  });

  it('logs failed live calls, and never caches them', async () => {
    setMuseTransport(async () => { throw Object.assign(new Error('bad gateway'), { status: 502 }); });
    await ask('hungry, 1 hr', 'Fri 9:05 AM').catch(() => {});
    await flush();
    expect(logged.at(-1)).toMatchObject({ ok: false, cached: false });
    expect((await store.stats('2000-01-01T00:00:00.000Z')).entries).toBe(0);
  });
});

describe('plan pipeline', () => {
  const INTENT = JSON.stringify({
    understood: true, activities: ['food'], budgetMax: 15, durationMinutes: 60, startsInMinutes: null,
    startClock: null, endClock: null, partOfDay: null, maxWalkMinutes: null, wantsFriends: true,
    openToNewPeople: true, vibe: null,
  });
  const fake: MuseTransport = async (req) => {
    calls++;
    if (req.schemaName === 'intent') return { content: INTENT, usage };
    const user = JSON.parse(req.messages[1].content) as { candidates: { id: string }[] };
    return {
      content: JSON.stringify({
        summary: 'Two plans fit.',
        picks: user.candidates.slice(0, 2).map((c) => ({ candidate: c.id, friends: [], reason: 'You like food.', bridge: null, inviteDraft: null })),
      }),
      usage,
    };
  };

  it('the same ask a minute later is served from the cache for parse and rank, with live seats', async () => {
    process.env.MUSE_PREBAKED = '1';
    setMuseTransport(fake);
    const now = new Date('2026-11-13T10:00:00-08:00');
    const first = await plan({ text: 'hungry, 1 hr, under $15', userId: 'alex', now });
    expect(first.meta.cache).toEqual({ parse: false, rank: false });
    expect(calls).toBe(2);
    const later = await plan({ text: 'Hungry, 1 hr, under $15', userId: 'alex', now: new Date(now.getTime() + 60_000) });
    expect(later.meta.cache).toEqual({ parse: true, rank: true });
    expect(calls).toBe(2);
    expect(later.meta.source).toBe('muse');
    expect(later.plan.suggestions.map((s) => s.questId)).toEqual(first.plan.suggestions.map((s) => s.questId));
    for (const s of later.plan.suggestions) expect(typeof s.seatsLeft).toBe('number');
  });
});
