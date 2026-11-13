// SupabaseStore: the same store logic over Supabase (server-only, service-role key).
// Reads load the tables with supabase-js (paged, in parallel). A route reads them once per request
// (its working snapshot, see request-scope.ts) and applies its own writes to that copy, so a
// mutation does one full read however many rows it writes. GETs that are not marked fresh may
// share an 800 ms cache. Seats only move through the join_quest/leave_quest RPCs.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ID } from '@/shared';
import { applyInsert, applyRemove, applyUpdate, applyUpsert, type Backend, type Match, type TogetherVoteResult } from './backend';
import { CoreStore } from './core';
import { emptyDb, fromRow, OPTIONAL_TABLES, PRIMARY_KEYS, TABLE_KEYS, TABLE_NAMES, toRow, type Db, type RowOf, type TableKey } from './db';
import type { SupabaseEnv } from './env';
import { badRequest, conflict, HttpError, notFound } from './errors';
import { currentScope } from './request-scope';

const PAGE = 1000;
export const SNAPSHOT_TTL_MS = 10_000;
/** Ordinary reads may serve a snapshot up to this old while one background reload runs. */
export const SNAPSHOT_STALE_MS = 60_000;
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

type DbError = { message: string; code?: string } | null;

function fail(table: string, error: DbError): void {
  if (!error) return;
  if (error.code === '23505') throw conflict(`duplicate key in ${table}`);
  throw new HttpError(502, `database error on ${table}: ${error.message}`);
}

const warned = new Set<string>();
function warnMissing(table: string) {
  if (warned.has(table)) return;
  warned.add(table);
  console.warn(`[supabase] table ${table} is missing; reading it as empty. Run the latest migration (npm run db:migrate:dev / :demo).`);
}

export class SupabaseBackend implements Backend {
  readonly kind = 'supabase' as const;
  private client: SupabaseClient;
  /**
   * Write generation. It is bumped when a write starts and again when the write resolves, so a
   * load that ran at any moment during a write carries an older generation and is never served
   * from the shared cache afterwards.
   */
  private gen = 0;
  private cache: { gen: number; at: number; db: Promise<Db> } | null = null;

  constructor(env: SupabaseEnv | { client: SupabaseClient }) {
    this.client = 'client' in env ? env.client : createClient(env.url, env.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private async loadTable<T extends TableKey>(key: T): Promise<RowOf<T>[]> {
    const table = TABLE_NAMES[key];
    const order = PRIMARY_KEYS[key].map(snake);
    const scope = currentScope();
    const page = (from: number, count: boolean) => {
      let q = this.client.from(table).select('*', count ? { count: 'exact' } : undefined);
      for (const col of order) q = q.order(col, { ascending: true });
      if (scope) scope.queries++;
      return q.range(from, from + PAGE - 1);
    };
    // First page also returns the exact row count; the remaining pages load in parallel
    // (reactions has ~3k rows, so this is 2 round trips instead of 4 sequential ones).
    const first = await page(0, true);
    // Tables added by a later migration read as empty until that migration is applied, so a
    // deploy that lands before `db:migrate` still serves every page (writes to them fail).
    if (first.error && OPTIONAL_TABLES.has(key) && /Could not find the table|does not exist|PGRST205|42P01/.test(`${first.error.code ?? ''} ${first.error.message ?? ''}`)) {
      warnMissing(table);
      return [];
    }
    fail(table, first.error);
    const rows: Record<string, unknown>[] = [...((first.data ?? []) as Record<string, unknown>[])];
    const total = first.count ?? rows.length;
    if (rows.length === PAGE && total > PAGE) {
      const rest = await Promise.all(
        Array.from({ length: Math.ceil(total / PAGE) - 1 }, (_, i) => page((i + 1) * PAGE, false)),
      );
      for (const r of rest) { fail(table, r.error); rows.push(...((r.data ?? []) as Record<string, unknown>[])); }
    }
    return rows.map((r) => fromRow(key, r));
  }

  private load(): Promise<Db> {
    const scope = currentScope();
    if (scope) scope.loads++;
    return (async () => {
      const out = emptyDb();
      const loaded = await Promise.all(TABLE_KEYS.map((k) => this.loadTable(k)));
      TABLE_KEYS.forEach((k, i) => { (out[k] as unknown[]) = loaded[i]; });
      return out;
    })();
  }

  /** Loads every table and offers the result to the shared cache under the current generation. */
  private loadAndCache(): Promise<Db> {
    const entry = { gen: this.gen, at: Date.now(), db: this.load() };
    this.cache = entry;
    entry.db.catch(() => { if (this.cache === entry) this.cache = null; });
    return entry.db;
  }

  /** The shared cache entry if no write happened since it started loading and it is recent. */
  private shared(startedAfter = -Infinity): Promise<Db> {
    const c = this.cache;
    if (c && c.gen === this.gen && c.at >= startedAfter) {
      const age = Date.now() - c.at;
      if (age < SNAPSHOT_TTL_MS) return c.db;
      // Stale-while-revalidate for ordinary reads only (fresh requests pass startedAfter and
      // never get here with an older load). A full snapshot load is 1-3 s, so plain page reads
      // take the last snapshot and trigger one background reload. Writes bump `gen`, which skips
      // this branch, and realtime-triggered refetches are fresh, so cross-tab updates stay exact.
      if (startedAfter === -Infinity && age < SNAPSHOT_STALE_MS) {
        if (!this.refreshing) {
          this.refreshing = this.loadAndCache().catch(() => undefined).finally(() => { this.refreshing = null; });
        }
        return c.db;
      }
    }
    return this.loadAndCache();
  }

  private refreshing: Promise<unknown> | null = null;

  /**
   * In a route: the request's working snapshot. It is loaded once and then kept current with the
   * request's own writes. A fresh request only takes a load that began after it arrived (so it
   * sees every write committed before it was sent); other requests may take any cached load.
   * Outside a route: the shared cache.
   */
  async snapshot(): Promise<Db> {
    const scope = currentScope();
    if (!scope) return { ...(await this.shared()) };
    scope.working ??= this.shared(scope.fresh ? scope.since : -Infinity).then((db) => ({ ...db }));
    return { ...(await scope.working) };
  }

  /** Runs one database write, then applies it to the request's working snapshot. */
  private async write(table: TableKey, run: () => PromiseLike<{ error: DbError }>, apply: (db: Db) => void): Promise<void> {
    const scope = currentScope();
    this.gen++;
    try {
      if (scope) scope.queries++;
      const { error } = await run();
      fail(TABLE_NAMES[table], error);
    } finally {
      this.gen++;
    }
    if (scope?.working) apply(await scope.working);
  }

  private applyMatch<Q extends { eq: (c: string, v: unknown) => Q; in: (c: string, v: unknown[]) => Q }>(
    table: TableKey, q: Q, match: Record<string, unknown>,
  ): Q {
    const row = toRow(table, match);
    for (const [col, v] of Object.entries(row)) {
      if (v === undefined) continue;
      q = Array.isArray(v) ? q.in(col, v) : q.eq(col, v);
    }
    return q;
  }

  async insert<T extends TableKey>(table: T, rows: RowOf<T>[]): Promise<void> {
    if (!rows.length) return;
    await this.write(table,
      () => this.client.from(TABLE_NAMES[table]).insert(rows.map((r) => toRow(table, r as Record<string, unknown>))),
      (db) => applyInsert(db, table, rows, false));
  }

  async upsert<T extends TableKey>(table: T, rows: RowOf<T>[]): Promise<void> {
    if (!rows.length) return;
    const onConflict = PRIMARY_KEYS[table].map(snake).join(',');
    await this.write(table,
      () => this.client.from(TABLE_NAMES[table]).upsert(rows.map((r) => toRow(table, r as Record<string, unknown>)), { onConflict }),
      (db) => applyUpsert(db, table, rows));
  }

  async update<T extends TableKey>(table: T, match: Match<T>, patch: Partial<RowOf<T>>): Promise<void> {
    await this.write(table, () => {
      const q = this.client.from(TABLE_NAMES[table]).update(toRow(table, patch as Record<string, unknown>));
      return this.applyMatch(table, q, match as Record<string, unknown>);
    }, (db) => applyUpdate(db, table, match, patch));
  }

  async remove<T extends TableKey>(table: T, match: Match<T>): Promise<void> {
    await this.write(table, () => {
      const q = this.client.from(TABLE_NAMES[table]).delete();
      return this.applyMatch(table, q, match as Record<string, unknown>);
    }, (db) => applyRemove(db, table, match));
  }

  private rpcError(error: { message: string }): never {
    const m = error.message ?? '';
    if (m.includes('quest_full')) throw conflict('quest_full');
    if (m.includes('quest_closed')) throw conflict('quest_closed');
    if (m.includes('quest_not_found')) throw notFound('quest_not_found');
    throw new HttpError(502, `seat update failed: ${m}`);
  }

  /**
   * Calls a seat RPC, then reads that quest row and its members back from the database into the
   * working snapshot, so memberIds and the published memberCount come from after the commit.
   */
  private async seatRpc(fn: 'join_quest' | 'leave_quest', args: Record<string, unknown>, questId: ID): Promise<number> {
    const scope = currentScope();
    this.gen++;
    let seats: number;
    try {
      if (scope) scope.queries++;
      const { data, error } = await this.client.rpc(fn, args);
      if (error) this.rpcError(error);
      seats = Number(data);
    } finally {
      this.gen++;
    }
    if (scope?.working) {
      scope.queries += 2;
      const [q, m] = await Promise.all([
        this.client.from(TABLE_NAMES.quests).select('*').eq('id', questId),
        this.client.from(TABLE_NAMES.questMembers).select('*').eq('quest_id', questId),
      ]);
      fail(TABLE_NAMES.quests, q.error);
      fail(TABLE_NAMES.questMembers, m.error);
      const db = await scope.working;
      const quests = ((q.data ?? []) as Record<string, unknown>[]).map((r) => fromRow('quests', r));
      const members = ((m.data ?? []) as Record<string, unknown>[]).map((r) => fromRow('questMembers', r));
      db.quests = [...db.quests.filter((x) => x.id !== questId), ...quests];
      db.questMembers = [...db.questMembers.filter((x) => x.questId !== questId), ...members];
    }
    return seats;
  }

  async joinQuest(questId: ID, userId: ID, withFriendId: ID | null): Promise<number> {
    return this.seatRpc('join_quest', { p_quest: questId, p_user: userId, p_with_friend: withFriendId }, questId);
  }

  async leaveQuest(questId: ID, userId: ID): Promise<number> {
    return this.seatRpc('leave_quest', { p_quest: questId, p_user: userId }, questId);
  }

  /** Re-reads one table into this request's working snapshot (e.g. a row another request just inserted). */
  async reload(table: TableKey): Promise<void> {
    const scope = currentScope();
    if (!scope?.working) return;
    const rows = await this.loadTable(table);
    const db = await scope.working;
    (db[table] as unknown[]) = rows;
  }

  /** public.vote_together (0006), then the plan and the quest it touched are read back into the working snapshot. */
  async voteTogether(planId: ID, userId: ID, questId: ID, isIn: boolean): Promise<TogetherVoteResult> {
    const scope = currentScope();
    this.gen++;
    let result: TogetherVoteResult;
    try {
      if (scope) scope.queries++;
      const { data, error } = await this.client.rpc('vote_together', { p_plan: planId, p_user: userId, p_quest: questId, p_in: isIn });
      if (error) {
        const m = error.message ?? '';
        if (m.includes('plan_not_found')) throw notFound('plan_not_found');
        if (m.includes('not_an_option')) throw badRequest('not_an_option');
        this.rpcError(error);
      }
      const row = (Array.isArray(data) ? data[0] : data) as { out_status: TogetherVoteResult['status']; out_quest: string | null; out_seats: number | null } | undefined;
      result = { status: row?.out_status ?? 'proposing', questId: row?.out_quest ?? null, seatsLeft: row?.out_seats ?? null };
    } finally {
      this.gen++;
    }
    if (scope?.working) {
      scope.queries += result.questId ? 3 : 1;
      const [pl, q, m] = await Promise.all([
        this.client.from(TABLE_NAMES.togetherPlans).select('*').eq('id', planId),
        result.questId ? this.client.from(TABLE_NAMES.quests).select('*').eq('id', result.questId) : Promise.resolve({ data: null, error: null }),
        result.questId ? this.client.from(TABLE_NAMES.questMembers).select('*').eq('quest_id', result.questId) : Promise.resolve({ data: null, error: null }),
      ]);
      fail(TABLE_NAMES.togetherPlans, pl.error);
      const db = await scope.working;
      const plans = ((pl.data ?? []) as Record<string, unknown>[]).map((r) => fromRow('togetherPlans', r));
      db.togetherPlans = [...db.togetherPlans.filter((x) => x.id !== planId), ...plans];
      if (result.questId) {
        fail(TABLE_NAMES.quests, q.error);
        fail(TABLE_NAMES.questMembers, m.error);
        const quests = ((q.data ?? []) as Record<string, unknown>[]).map((r) => fromRow('quests', r));
        const members = ((m.data ?? []) as Record<string, unknown>[]).map((r) => fromRow('questMembers', r));
        db.quests = [...db.quests.filter((x) => x.id !== result.questId), ...quests];
        db.questMembers = [...db.questMembers.filter((x) => x.questId !== result.questId), ...members];
      }
    }
    return result;
  }

  async uploadFile(bucket: 'uploads' | 'memories' | 'crew-photos', path: string, bytes: Uint8Array, contentType: string): Promise<string> {
    const { error } = await this.client.storage.from(bucket).upload(path, bytes, { contentType, upsert: false });
    if (error) throw new HttpError(502, `upload failed: ${error.message}`);
    if (bucket === 'crew-photos') return path;
    return this.client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  async downloadCrewPhoto(id: ID): Promise<Blob> {
    const { data, error } = await this.client.storage.from('crew-photos').download(id);
    if (error || !data) throw notFound('photo_not_found');
    return data;
  }
}

export function createSupabaseStore(env: SupabaseEnv): CoreStore {
  return new CoreStore(new SupabaseBackend(env));
}
