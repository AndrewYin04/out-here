// SupabaseBackend over a fake supabase-js client (no network): the snapshot cache must never
// serve rows loaded before or during a write (finding E2), a mutating request must read the
// tables once (finding E3), and a request's Broadcasts go out in one REST call.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_CENTER, profileId, seedId, setNow } from '@/shared';
import { CoreStore } from '@/features/data/core';
import { TABLE_KEYS, TABLE_NAMES, toRow } from '@/features/data/db';
import { buildMemoryDb } from '@/features/data/memory-store';
import { flushOutbox, subscribe } from '@/features/data/realtime-server';
import { newScope, runInScope } from '@/features/data/request-scope';
import { SLOW_MESSAGE, SupabaseBackend } from '@/features/data/supabase-store';
import { HttpError } from '@/features/data/errors';
import { TABLES, TableNotLoadedError } from '@/features/data/tables';

type Row = Record<string, unknown>;
const NOW = new Date('2026-11-12T18:07:00Z');
const alex = profileId('alex');
const maya = profileId('maya');
const dumplings = seedId('quest', 'dumplings');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Just enough of the supabase-js query builder for SupabaseBackend. */
class FakeSupabase {
  tables = new Map<string, Row[]>();
  rpcDelayMs = 0;
  selects = 0;
  /** Tables whose selects never answer (a stalled database). */
  hang = new Set<string>();
  /** Table name of every select, in order. */
  selected: string[] = [];
  constructor() {
    const db = buildMemoryDb(NOW);
    for (const k of TABLE_KEYS) this.tables.set(TABLE_NAMES[k], (db[k] as unknown as Row[]).map((r) => toRow(k, r)));
  }
  from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let op: { kind: 'select' } | { kind: 'insert' | 'upsert'; rows: Row[] } | { kind: 'update'; patch: Row } | { kind: 'delete' } = { kind: 'select' };
    let range: [number, number] | null = null;
    const b = {
      select() { op = { kind: 'select' }; return b; },
      order() { return b; },
      range(from: number, to: number) { range = [from, to]; return b; },
      abortSignal() { return b; },
      eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return b; },
      in(c: string, v: unknown[]) { filters.push((r) => v.includes(r[c])); return b; },
      insert(rows: Row[]) { op = { kind: 'insert', rows }; return b; },
      upsert(rows: Row[]) { op = { kind: 'upsert', rows }; return b; },
      update(patch: Row) { op = { kind: 'update', patch }; return b; },
      delete() { op = { kind: 'delete' }; return b; },
      then: <R,>(res: (v: { data: Row[] | null; error: null }) => R) => {
        return Promise.resolve().then(() => {
          const rows = this.tables.get(table) ?? [];
          const hit = (r: Row) => filters.every((f) => f(r));
          if (op.kind === 'select') {
            this.selects++;
            this.selected.push(table);
            if (this.hang.has(table)) return new Promise<R>(() => {});
            const out = rows.filter(hit).map((r) => ({ ...r }));
            return res({ data: range ? out.slice(range[0], range[1] + 1) : out, error: null });
          }
          if (op.kind === 'insert' || op.kind === 'upsert') this.tables.set(table, [...rows, ...op.rows]);
          if (op.kind === 'update') { const p = op.patch; this.tables.set(table, rows.map((r) => (hit(r) ? { ...r, ...p } : r))); }
          if (op.kind === 'delete') this.tables.set(table, rows.filter((r) => !hit(r)));
          return res({ data: null, error: null });
        });
      },
    };
    return b;
  };
  async rpc(fn: string, args: Row) {
    await sleep(this.rpcDelayMs);
    const members = this.tables.get('quest_members')!;
    const q = this.tables.get('quests')!.find((x) => x.id === args.p_quest)!;
    if (fn === 'join_quest') {
      for (const u of [args.p_user, args.p_with_friend].filter(Boolean)) {
        if (!members.some((m) => m.quest_id === args.p_quest && m.user_id === u)) {
          members.push({ quest_id: args.p_quest, user_id: u, joined_at: NOW.toISOString(), via_friend_id: null });
        }
      }
    }
    if (fn === 'leave_quest') this.tables.set('quest_members', members.filter((m) => !(m.quest_id === args.p_quest && m.user_id === args.p_user)));
    const count = this.tables.get('quest_members')!.filter((m) => m.quest_id === args.p_quest).length;
    return { data: Number(q.capacity) - count, error: null };
  }
}

function setup() {
  const fake = new FakeSupabase();
  const backend = new SupabaseBackend({ client: fake as never });
  return { fake, backend, store: new CoreStore(backend) };
}

beforeEach(() => setNow(NOW));
afterAll(() => setNow(null));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('SupabaseBackend snapshot cache (E2)', () => {
  it('a read that ran during a join is not served to the next reader', async () => {
    const { fake, store } = setup();
    fake.rpcDelayMs = 60;
    expect((await store.view()).questMemberIds(dumplings)).not.toContain(maya);

    const join = store.joinQuest(maya, dumplings);
    await sleep(10);
    // a concurrent reader (another screen refetching) loads while the RPC is in flight
    const during = await store.view();
    expect(during.questMemberIds(dumplings)).not.toContain(maya);
    await join;

    // within the 800 ms TTL, the next reader must still see the commit
    const after = await store.view();
    expect(after.questMemberIds(dumplings)).toContain(maya);
  });

  it('inside a request, the join result and the published memberCount include the joiner even with a concurrent stale read', async () => {
    const { fake, store } = setup();
    fake.rpcDelayMs = 60;
    const before = (await store.view()).questMemberIds(dumplings).length;
    const msgs: Record<string, unknown>[] = [];
    const off = subscribe((m) => { if (m.channel === `quest:${dumplings}`) msgs.push(m.payload); });
    const join = runInScope(newScope(true), () => store.joinQuest(maya, dumplings));
    await sleep(10);
    await runInScope(newScope(false), () => store.view());
    const res = await join;
    off();
    expect(res.quest.memberIds).toContain(maya);
    expect(msgs.at(-1)).toMatchObject({ memberCount: before + 1, seatsLeft: res.seatsLeft });
  });

  it('a fresh request does not reuse a snapshot loaded before it arrived', async () => {
    const { fake, store } = setup();
    await store.view(); // warm the shared cache
    // another instance commits a join (the fake table changes behind this instance's cache)
    fake.tables.get('quest_members')!.push({ quest_id: dumplings, user_id: maya, joined_at: NOW.toISOString(), via_friend_id: null });
    const cached = await runInScope(newScope(false), () => store.view());
    expect(cached.questMemberIds(dumplings)).not.toContain(maya);
    const fresh = await runInScope(newScope(true), () => store.view());
    expect(fresh.questMemberIds(dumplings)).toContain(maya);
  });
});

describe('SupabaseBackend request cost (E3)', () => {
  it('createInvite + respondInvite each load the tables once, and their Broadcasts go out in one call', async () => {
    vi.stubEnv('OUTHERE_STORE', '');
    vi.stubEnv('DATA_TARGET', 'dev');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL_DEV', 'https://fake.supabase.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY_DEV', 'fake-service-key');
    const calls: { url: string; messages: unknown[] }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
      calls.push({ url, messages: (JSON.parse(init.body) as { messages: unknown[] }).messages });
      return new Response('{}', { status: 202 });
    });
    const { store } = setup();

    const s1 = newScope(true);
    const invite = await runInScope(s1, () => store.createInvite(alex, { toId: maya, questId: dumplings, suggestionTitle: 'Dumplings', message: 'come?' }));
    expect(calls).toHaveLength(0); // queued until the route flushes
    expect(await flushOutbox(s1)).toBeGreaterThanOrEqual(3);
    expect(s1.loads).toBe(1);
    expect(calls).toHaveLength(1);

    const s2 = newScope(true);
    const res = await runInScope(s2, () => store.respondInvite(maya, invite.id, 'accepted'));
    await flushOutbox(s2);
    expect(s2.loads).toBe(1);
    expect(res.quest?.memberIds).toEqual(expect.arrayContaining([alex, maya]));
    expect(calls).toHaveLength(2);
    expect(calls[1].messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ topic: `quest:${dumplings}`, payload: expect.objectContaining({ memberCount: res.quest!.memberIds.length }) }),
    ]));
  });
});

describe('SupabaseBackend query deadline (issue #36)', () => {
  it('a stalled table query fails with 503 "Data is slow" at 8 s, and so does a request waiting on that load', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const { fake, store } = setup();
      fake.hang.add('quests');
      const settled: string[] = [];
      const track = (name: string, p: Promise<unknown>) => p.then(() => settled.push(`${name}:ok`), (e: unknown) => {
        settled.push(`${name}:${(e as HttpError).status}:${(e as Error).message}`);
      });
      const a = track('a', runInScope(newScope(false), () => store.view(TABLES.quests)));
      await vi.advanceTimersByTimeAsync(4000);
      // a plain read 4 s later shares the stalled load from the cache
      const b = track('b', runInScope(newScope(false), () => store.questsNear(alex, DEMO_CENTER, 50_000)));
      await vi.advanceTimersByTimeAsync(3990);
      expect(settled).toEqual([]);
      await vi.advanceTimersByTimeAsync(20);
      await Promise.all([a, b]);
      expect(settled).toEqual([`a:503:${SLOW_MESSAGE}`, `b:503:${SLOW_MESSAGE}`]);
      // the failed load left the cache, so the next read queries again and succeeds
      fake.hang.clear();
      const v = await runInScope(newScope(false), () => store.view(TABLES.quests));
      expect(v.db.quests.length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('SupabaseBackend stale-while-revalidate (R1)', () => {
  it('while a background reload stalls, plain reads keep getting the last rows, and a failed reload keeps them', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const { fake, store } = setup();
      const plain = () => runInScope(newScope(false), () => store.view(TABLES.quests));
      const warm = await plain();
      const before = warm.db.quests.length;
      expect(before).toBeGreaterThan(0);
      await vi.advanceTimersByTimeAsync(11_000); // past SNAPSHOT_TTL_MS
      fake.hang.add('quests');
      fake.selected = [];
      // the first stale read starts one background reload and answers at once
      expect((await plain()).db.quests.length).toBe(before);
      expect(fake.selected.filter((t) => t === 'quests')).toHaveLength(1);
      // later plain reads during that reload get the same last rows, not the stalled promise
      await vi.advanceTimersByTimeAsync(1000);
      const settled: string[] = [];
      const reads = [1, 2, 3].map((i) => plain().then((v) => settled.push(`${i}:${v.db.quests.length}`), (e: unknown) => settled.push(`${i}:${(e as HttpError).status}`)));
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toEqual([`1:${before}`, `2:${before}`, `3:${before}`]);
      // the reload hits the 8 s deadline: the old rows stay and no reload starts right away
      await vi.advanceTimersByTimeAsync(8000);
      await Promise.all(reads);
      fake.selected = [];
      expect((await plain()).db.quests.length).toBe(before);
      expect(fake.selected).not.toContain('quests');
      // after the retry delay a plain read starts one new reload, which succeeds
      fake.hang.clear();
      await vi.advanceTimersByTimeAsync(3000);
      expect((await plain()).db.quests.length).toBe(before);
      expect(fake.selected.filter((t) => t === 'quests')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a fresh read waits for a load that started after it arrived, not for the stale rows', async () => {
    const { fake, store } = setup();
    await runInScope(newScope(false), () => store.view(TABLES.quests)); // warm
    await sleep(5);
    const q = fake.tables.get('quests')!;
    fake.tables.set('quests', q.map((r) => (r.id === dumplings ? { ...r, title: 'Renamed elsewhere' } : r)));
    const v = await runInScope(newScope(true), () => store.view(TABLES.quests));
    expect(v.db.quests.find((x) => x.id === dumplings)?.title).toBe('Renamed elsewhere');
  });
});

describe('SupabaseBackend table subsets (issue #36)', () => {
  it('the map read (GET /api/quests) loads the quest tables only: no reactions, posts, comments or messages', async () => {
    const { fake, store } = setup();
    const scope = newScope(true);
    await runInScope(scope, async () => {
      await store.profileByHandle('alex');
      return store.questsNear(alex, DEMO_CENTER, 50_000);
    });
    const tables = new Set(fake.selected);
    for (const t of ['reactions', 'posts', 'comments', 'messages', 'notifications', 'stories']) expect(tables.has(t)).toBe(false);
    expect(tables).toEqual(new Set(TABLES.quests.map((k) => TABLE_NAMES[k])));
    expect(scope.queries).toBe(TABLES.quests.length);
  });

  it('Up next (GET /api/quests/mine) loads 12 tables instead of every table', async () => {
    const { fake, store } = setup();
    const full = newScope(true);
    await runInScope(full, () => store.view());
    const fullQueries = full.queries;
    fake.selected = [];
    const scope = newScope(true);
    const plans = await runInScope(scope, () => store.yourPlans(alex));
    expect(plans.length).toBeGreaterThan(0);
    expect(fake.selected).not.toContain('reactions');
    expect(scope.queries).toBe(TABLES.yourPlans.length);
    expect(fullQueries).toBeGreaterThanOrEqual(TABLE_KEYS.length);
  });

  it('a write invalidates the subset cache: the next fresh read sees it, and a later read in the same request adds tables after the write', async () => {
    const { store } = setup();
    await runInScope(newScope(false), () => store.questsNear(alex, DEMO_CENTER, 50_000)); // warm
    const q = (await store.view(TABLES.quests)).db.quests.find((x) => x.id === dumplings)!;
    expect(q).toBeTruthy();
    await runInScope(newScope(true), async () => {
      await store.questsNear(maya, DEMO_CENTER, 50_000); // quest tables only
      await store.joinQuest(maya, dumplings);
      const plans = await store.yourPlans(maya); // loads crews after the join, keeps the joined quest
      expect(plans.map((p) => p.quest.id)).toContain(dumplings);
    });
    const after = await runInScope(newScope(false), () => store.view(TABLES.quests));
    expect(after.questMemberIds(dumplings)).toContain(maya);
  });
});

describe('MemoryStore table subsets', () => {
  it('reading a table outside the set throws, so a too-small set fails tests instead of showing empty data', async () => {
    const { createMemoryStore } = await import('@/features/data/memory-store');
    const store = createMemoryStore(NOW);
    const db = await store.backend.snapshot(TABLES.quests);
    expect(db.quests.length).toBeGreaterThan(0);
    expect(() => db.reactions).toThrow(TableNotLoadedError);
    expect(Object.keys({ ...db })).not.toContain('reactions');
    // the same rows as a full snapshot
    expect(db.quests).toBe((await store.backend.snapshot()).quests);
  });
});
