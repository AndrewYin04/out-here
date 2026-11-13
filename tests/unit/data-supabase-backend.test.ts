// SupabaseBackend over a fake supabase-js client (no network): the snapshot cache must never
// serve rows loaded before or during a write (finding E2), a mutating request must read the
// tables once (finding E3), and a request's Broadcasts go out in one REST call.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { profileId, seedId, setNow } from '@/shared';
import { CoreStore } from '@/features/data/core';
import { TABLE_KEYS, TABLE_NAMES, toRow } from '@/features/data/db';
import { buildMemoryDb } from '@/features/data/memory-store';
import { flushOutbox, subscribe } from '@/features/data/realtime-server';
import { newScope, runInScope } from '@/features/data/request-scope';
import { SupabaseBackend } from '@/features/data/supabase-store';

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
  selectDelayMs = 0;
  selects = 0;
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
      eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return b; },
      in(c: string, v: unknown[]) { filters.push((r) => v.includes(r[c])); return b; },
      insert(rows: Row[]) { op = { kind: 'insert', rows }; return b; },
      upsert(rows: Row[]) { op = { kind: 'upsert', rows }; return b; },
      update(patch: Row) { op = { kind: 'update', patch }; return b; },
      delete() { op = { kind: 'delete' }; return b; },
      then: <R,>(res: (v: { data: Row[] | null; error: null }) => R) => {
        const wait = op.kind === 'select' ? this.selectDelayMs : 0;
        return sleep(wait).then(() => {
          const rows = this.tables.get(table) ?? [];
          const hit = (r: Row) => filters.every((f) => f(r));
          if (op.kind === 'select') {
            this.selects++;
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

describe('SupabaseBackend partial refresh (plan routes)', () => {
  const live = ['availability', 'quests', 'questMembers', 'togetherPlans', 'locationShares'] as const;
  const joinMaya = (fake: FakeSupabase) =>
    fake.tables.get('quest_members')!.push({ quest_id: dumplings, user_id: maya, joined_at: NOW.toISOString(), via_friend_id: null });

  it('reuses the warm snapshot but re-reads the live tables', async () => {
    const { fake, store } = setup();
    await store.view();
    joinMaya(fake); // another instance commits a join
    const scope = newScope(false, [...live]);
    const v = await runInScope(scope, () => store.view());
    expect(v.questMemberIds(dumplings)).toContain(maya);
    expect(scope.loads).toBe(0);
    expect(scope.queries).toBe(live.length);
  });

  it('still re-reads them when the cache is past its TTL and a background reload starts', async () => {
    const { fake, store } = setup();
    const t0 = Date.now();
    await store.view();
    joinMaya(fake);
    const spy = vi.spyOn(Date, 'now').mockReturnValue(t0 + 20_000); // stale, inside the stale window
    try {
      const scope = newScope(false, [...live]);
      const v = await runInScope(scope, () => store.view());
      expect(v.questMemberIds(dumplings)).toContain(maya);
    } finally {
      spy.mockRestore();
    }
  });

  it('a stale cache keeps serving the old snapshot while the background reload runs', async () => {
    const { fake, store } = setup();
    const t0 = Date.now();
    await store.view();
    joinMaya(fake);
    fake.selectDelayMs = 150;
    const spy = vi.spyOn(Date, 'now').mockReturnValue(t0 + 20_000);
    try {
      expect((await store.view()).questMemberIds(dumplings)).not.toContain(maya); // starts the reload
      const started = performance.now();
      const second = await store.view(); // must not wait for the reload in flight
      expect(performance.now() - started).toBeLessThan(100);
      expect(second.questMemberIds(dumplings)).not.toContain(maya);
      await sleep(400);
      expect((await store.view()).questMemberIds(dumplings)).toContain(maya); // reload landed
    } finally {
      spy.mockRestore();
    }
  });

  it('a cold cache loads once and skips the extra re-read', async () => {
    const { store } = setup();
    const scope = newScope(false, [...live]);
    await runInScope(scope, () => store.view());
    expect(scope.loads).toBe(1);
    expect(scope.queries).toBe(TABLE_KEYS.length);
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
