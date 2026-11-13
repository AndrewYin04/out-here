// SupabaseStore: the same store logic over Supabase (server-only, service-role key).
// Reads load whole tables with supabase-js (paged, in parallel), and only the tables a store
// method names (tables.ts): the map and Out Here routes read 5 to 12 tables, not all 35. A route
// reads each table once per request (its working snapshot, see request-scope.ts) and applies its
// own writes to that copy. GETs that are not marked fresh may share a per-table cache. Every table
// query has an 8 s deadline, so a stalled database answers 503 instead of hanging the request.
// Seats only move through the join_quest/leave_quest RPCs.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ID } from '@/shared';
import { applyInsert, applyRemove, applyUpdate, applyUpsert, type Backend, type Match, type TogetherVoteResult } from './backend';
import { CoreStore } from './core';
import { fromRow, OPTIONAL_TABLES, PRIMARY_KEYS, TABLE_KEYS, TABLE_NAMES, toRow, type Db, type RowOf, type TableKey } from './db';
import type { SupabaseEnv } from './env';
import { badRequest, conflict, HttpError, notFound } from './errors';
import { currentScope, type WorkingSnapshot } from './request-scope';
import { subsetDb, tableList, type TableSet } from './tables';

const PAGE = 1000;
export const SNAPSHOT_TTL_MS = 10_000;
/** Ordinary reads may serve a snapshot up to this old while one background reload runs. */
export const SNAPSHOT_STALE_MS = 60_000;
/** Deadline for loading one table (all its pages). */
export const QUERY_TIMEOUT_MS = 8_000;
export const SLOW_MESSAGE = 'Data is slow, try again';
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

type DbError = { message: string; code?: string } | null;

function fail(table: string, error: DbError): void {
  if (!error) return;
  if (error.code === '23505') throw conflict(`duplicate key in ${table}`);
  if (/abort/i.test(error.message ?? '')) throw new HttpError(503, SLOW_MESSAGE);
  throw new HttpError(502, `database error on ${table}: ${error.message}`);
}

/** Warn once per missing optional table (OPTIONAL_TABLES in db.ts); see loadTable. */
const warned = new Set<string>();
function warnMissing(table: string) {
  if (warned.has(table)) return;
  warned.add(table);
  console.warn(`[supabase] table ${table} is missing; reading it as empty. Run the latest migration (npm run db:migrate:dev / :demo).`);
}

/** A table read outside its view's set (a bug in tables.ts): logged once, read as empty. */
const misses = new Set<string>();
function notLoaded(table: TableKey): unknown[] {
  if (!misses.has(table)) {
    misses.add(table);
    console.error(`[supabase] table ${table} was read but not loaded for this view; add it to the set in src/features/data/tables.ts`);
  }
  return [];
}

/** One load of a table: the write generation and the time it started. */
type Load = { gen: number; at: number; promise: Promise<unknown[]> };
/**
 * The shared cache for one table. `rows` is the last load that succeeded (with its gen and start
 * time); `pending` is the newest load still running. They are kept apart so plain reads keep
 * getting the last rows while a background reload runs, and a failed reload leaves them in place.
 */
type CacheEntry = { rows: { gen: number; at: number; rows: unknown[] } | null; pending: Load | null; retryAt: number };
/** After a background reload fails, plain reads serve the last rows this long before trying again. */
export const RETRY_AFTER_MS = 2_000;

export type SupabaseBackendOptions = { queryTimeoutMs?: number };

export class SupabaseBackend implements Backend {
  readonly kind = 'supabase' as const;
  private client: SupabaseClient;
  private queryTimeoutMs: number;
  /**
   * Write generation per table. A write bumps its table's generation when it starts and again
   * when it resolves, so a load of that table that ran at any moment during the write carries an
   * older generation and is never served from the shared cache afterwards. Other tables keep
   * their cached rows: a walk step (locationShares) or a reaction no longer makes the next read
   * reload quests and profiles. RPCs touch several tables and bump every table.
   */
  private gens = new Map<TableKey, number>();
  private gen(key: TableKey): number { return this.gens.get(key) ?? 0; }
  private bump(keys: readonly TableKey[] = TABLE_KEYS): void {
    for (const k of keys) this.gens.set(k, this.gen(k) + 1);
  }
  /** One entry per table: the last load of that table on this instance. */
  private cache = new Map<TableKey, CacheEntry>();

  constructor(env: SupabaseEnv | { client: SupabaseClient }, opts: SupabaseBackendOptions = {}) {
    this.client = 'client' in env ? env.client : createClient(env.url, env.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.queryTimeoutMs = opts.queryTimeoutMs ?? QUERY_TIMEOUT_MS;
  }

  /**
   * Loads one table, every page, within the deadline. On timeout the page queries are aborted and
   * the promise rejects with 503 at the deadline, even if the client ignores the abort, so every
   * request waiting on this load (it may be shared through the cache) fails fast too.
   */
  private loadTable<T extends TableKey>(key: T): Promise<RowOf<T>[]> {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ctrl.abort();
        reject(new HttpError(503, SLOW_MESSAGE));
      }, this.queryTimeoutMs);
    });
    const work = this.loadTablePages(key, ctrl.signal);
    work.catch(() => undefined);
    return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
  }

  private async loadTablePages<T extends TableKey>(key: T, signal: AbortSignal): Promise<RowOf<T>[]> {
    const table = TABLE_NAMES[key];
    const order = PRIMARY_KEYS[key].map(snake);
    const scope = currentScope();
    const page = (from: number, count: boolean) => {
      let q = this.client.from(table).select('*', count ? { count: 'exact' } : undefined);
      for (const col of order) q = q.order(col, { ascending: true });
      if (scope) scope.queries++;
      return q.range(from, from + PAGE - 1).abortSignal(signal);
    };
    // First page also returns the exact row count; the remaining pages load in parallel
    // (reactions has ~3k rows, so this is 2 round trips instead of 4 sequential ones).
    // One retry when the request never reached the database (a dropped connection).
    let first = await page(0, true);
    if (first.error && !signal.aborted && /fetch failed|network|ECONNRESET|ETIMEDOUT|socket/i.test(first.error.message ?? '')) first = await page(0, true);
    if (signal.aborted) throw new HttpError(503, SLOW_MESSAGE);
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
      if (signal.aborted) throw new HttpError(503, SLOW_MESSAGE);
      for (const r of rest) { fail(table, r.error); rows.push(...((r.data ?? []) as Record<string, unknown>[])); }
    }
    return rows.map((r) => fromRow(key, r));
  }

  private entry(key: TableKey): CacheEntry {
    let e = this.cache.get(key);
    if (!e) { e = { rows: null, pending: null, retryAt: -Infinity }; this.cache.set(key, e); }
    return e;
  }

  /**
   * Loads one table and records it as the table's pending load. On success the rows replace the
   * cached rows unless a newer load already did; on failure the cached rows stay and background
   * reloads wait RETRY_AFTER_MS.
   */
  private loadAndCache(key: TableKey): Promise<unknown[]> {
    const scope = currentScope();
    if (scope) scope.tableLoads++;
    const e = this.entry(key);
    const load: Load = { gen: this.gen(key), at: Date.now(), promise: this.loadTable(key) };
    e.pending = load;
    load.promise.then((rows) => {
      if (e.pending === load) e.pending = null;
      if (!e.rows || e.rows.at <= load.at) e.rows = { gen: load.gen, at: load.at, rows };
    }, () => {
      if (e.pending === load) e.pending = null;
      e.retryAt = Date.now() + RETRY_AFTER_MS;
    });
    return load.promise;
  }

  /**
   * One table through the shared cache. Only loads with the current write generation count (no
   * write happened since they started). A fresh read (`startedAfter` set) takes cached rows or a
   * running load only if it started after `startedAfter`, else loads. A plain read takes rows
   * under SNAPSHOT_TTL_MS old; rows up to SNAPSHOT_STALE_MS old are served at once while one
   * background reload runs (stale-while-revalidate); with no usable rows it shares the running
   * load or starts one.
   */
  private sharedTable(key: TableKey, startedAfter = -Infinity): Promise<unknown[]> {
    const e = this.entry(key);
    const now = Date.now();
    const gen = this.gen(key);
    const rows = e.rows && e.rows.gen === gen && e.rows.at >= startedAfter ? e.rows : null;
    const pending = e.pending && e.pending.gen === gen && e.pending.at >= startedAfter ? e.pending : null;
    if (rows && now - rows.at < SNAPSHOT_TTL_MS) return Promise.resolve(rows.rows);
    if (rows && startedAfter === -Infinity && now - rows.at < SNAPSHOT_STALE_MS) {
      // Writes bump the table's gen, which skips this branch, and realtime-triggered refetches are fresh,
      // so cross-tab updates stay exact.
      if (!pending && now >= e.retryAt) this.loadAndCache(key).catch(() => undefined);
      return Promise.resolve(rows.rows);
    }
    if (pending) return pending.promise;
    return this.loadAndCache(key);
  }

  /**
   * The tables in `set` (all tables when omitted).
   * In a route: the request's working snapshot. Each table is loaded once per request and then
   * kept current with the request's own writes. A fresh request only takes a load that began
   * after it arrived (so it sees every write committed before it was sent); other requests may
   * take any cached load. Outside a route: the shared cache.
   */
  async snapshot(set?: TableSet): Promise<Db> {
    const keys = tableList(set);
    const scope = currentScope();
    if (!scope) {
      const rows = await Promise.all(keys.map((k) => this.sharedTable(k)));
      const tables: Partial<Db> = {};
      keys.forEach((k, i) => { (tables[k] as unknown) = rows[i]; });
      return subsetDb(tables, keys, notLoaded);
    }
    const w: WorkingSnapshot = (scope.working ??= { tables: {}, pending: new Map() });
    const before = scope.tableLoads;
    await Promise.all(keys.map((k) => {
      if (k in w.tables) return undefined;
      let p = w.pending.get(k);
      if (!p) {
        const fresh = scope.fresh || scope.refresh.includes(k);
        p = this.sharedTable(k, fresh ? scope.since : -Infinity).then((rows) => {
          // a reload() that finished first holds newer rows
          if (!(k in w.tables)) (w.tables[k] as unknown) = rows;
          w.pending.delete(k);
        });
        const mine = p;
        p.catch(() => { if (w.pending.get(k) === mine) w.pending.delete(k); });
        w.pending.set(k, p);
      }
      return p;
    }));
    if (scope.tableLoads > before) scope.loads++;
    return subsetDb(w.tables, keys, notLoaded);
  }

  /**
   * Applies a write to the request's working copy of `table`: at once if loaded, after its load
   * if one is running. A table the request has not read is left alone; its first read comes
   * from the database after this write committed.
   */
  private async applyWorking(table: TableKey, apply: (db: Db) => void): Promise<void> {
    const w = currentScope()?.working;
    if (!w) return;
    if (!(table in w.tables)) {
      const p = w.pending.get(table);
      if (!p) return;
      await p;
    }
    apply(w.tables as Db);
  }

  /** Runs one database write, then applies it to the request's working snapshot. */
  private async write(table: TableKey, run: () => PromiseLike<{ error: DbError }>, apply: (db: Db) => void): Promise<void> {
    const scope = currentScope();
    this.bump([table]);
    try {
      if (scope) scope.queries++;
      const { error } = await run();
      fail(TABLE_NAMES[table], error);
    } finally {
      this.bump([table]);
    }
    await this.applyWorking(table, apply);
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
    this.bump();
    let seats: number;
    try {
      if (scope) scope.queries++;
      const { data, error } = await this.client.rpc(fn, args);
      if (error) this.rpcError(error);
      seats = Number(data);
    } finally {
      this.bump();
    }
    if (scope?.working) {
      scope.queries += 2;
      const [q, m] = await Promise.all([
        this.client.from(TABLE_NAMES.quests).select('*').eq('id', questId),
        this.client.from(TABLE_NAMES.questMembers).select('*').eq('quest_id', questId),
      ]);
      fail(TABLE_NAMES.quests, q.error);
      fail(TABLE_NAMES.questMembers, m.error);
      const quests = ((q.data ?? []) as Record<string, unknown>[]).map((r) => fromRow('quests', r));
      const members = ((m.data ?? []) as Record<string, unknown>[]).map((r) => fromRow('questMembers', r));
      await this.applyWorking('quests', (db) => { db.quests = [...db.quests.filter((x) => x.id !== questId), ...quests]; });
      await this.applyWorking('questMembers', (db) => { db.questMembers = [...db.questMembers.filter((x) => x.questId !== questId), ...members]; });
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
    (scope.working.tables[table] as unknown[]) = rows;
    scope.working.pending.delete(table);
  }

  /** public.vote_together (0006), then the plan and the quest it touched are read back into the working snapshot. */
  async voteTogether(planId: ID, userId: ID, questId: ID, isIn: boolean): Promise<TogetherVoteResult> {
    const scope = currentScope();
    this.bump();
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
      this.bump();
    }
    if (scope?.working) {
      scope.queries += result.questId ? 3 : 1;
      const [pl, q, m] = await Promise.all([
        this.client.from(TABLE_NAMES.togetherPlans).select('*').eq('id', planId),
        result.questId ? this.client.from(TABLE_NAMES.quests).select('*').eq('id', result.questId) : Promise.resolve({ data: null, error: null }),
        result.questId ? this.client.from(TABLE_NAMES.questMembers).select('*').eq('quest_id', result.questId) : Promise.resolve({ data: null, error: null }),
      ]);
      fail(TABLE_NAMES.togetherPlans, pl.error);
      const plans = ((pl.data ?? []) as Record<string, unknown>[]).map((r) => fromRow('togetherPlans', r));
      await this.applyWorking('togetherPlans', (db) => { db.togetherPlans = [...db.togetherPlans.filter((x) => x.id !== planId), ...plans]; });
      if (result.questId) {
        const qid = result.questId;
        fail(TABLE_NAMES.quests, q.error);
        fail(TABLE_NAMES.questMembers, m.error);
        const quests = ((q.data ?? []) as Record<string, unknown>[]).map((r) => fromRow('quests', r));
        const members = ((m.data ?? []) as Record<string, unknown>[]).map((r) => fromRow('questMembers', r));
        await this.applyWorking('quests', (db) => { db.quests = [...db.quests.filter((x) => x.id !== qid), ...quests]; });
        await this.applyWorking('questMembers', (db) => { db.questMembers = [...db.questMembers.filter((x) => x.questId !== qid), ...members]; });
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
