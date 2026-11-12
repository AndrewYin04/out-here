// SupabaseStore: the same store logic over Supabase (server-only, service-role key).
// Reads load the tables with supabase-js (paged, in parallel) into a short-lived snapshot;
// writes are row inserts/updates/deletes; seats only move through the join_quest/leave_quest RPCs.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ID } from '@/shared';
import type { Backend, Match } from './backend';
import { CoreStore } from './core';
import { emptyDb, fromRow, PRIMARY_KEYS, TABLE_KEYS, TABLE_NAMES, toRow, type Db, type RowOf, type TableKey } from './db';
import type { SupabaseEnv } from './env';
import { conflict, HttpError, notFound } from './errors';

const PAGE = 1000;
const SNAPSHOT_TTL_MS = 800;

function fail(table: string, error: { message: string; code?: string } | null): void {
  if (!error) return;
  if (error.code === '23505') throw conflict(`duplicate key in ${table}`);
  throw new HttpError(502, `database error on ${table}: ${error.message}`);
}

export class SupabaseBackend implements Backend {
  readonly kind = 'supabase' as const;
  private client: SupabaseClient;
  private cache: { at: number; db: Promise<Db> } | null = null;

  constructor(env: SupabaseEnv) {
    this.client = createClient(env.url, env.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private async loadTable<T extends TableKey>(key: T): Promise<RowOf<T>[]> {
    const table = TABLE_NAMES[key];
    const order = PRIMARY_KEYS[key].map((k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`));
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = this.client.from(table).select('*');
      for (const col of order) q = q.order(col, { ascending: true });
      const { data, error } = await q.range(from, from + PAGE - 1);
      fail(table, error);
      rows.push(...((data ?? []) as Record<string, unknown>[]));
      if (!data || data.length < PAGE) break;
    }
    return rows.map((r) => fromRow(key, r));
  }

  async snapshot(): Promise<Db> {
    if (this.cache && Date.now() - this.cache.at < SNAPSHOT_TTL_MS) return this.cache.db;
    const db = (async () => {
      const out = emptyDb();
      const loaded = await Promise.all(TABLE_KEYS.map((k) => this.loadTable(k)));
      TABLE_KEYS.forEach((k, i) => { (out[k] as unknown[]) = loaded[i]; });
      return out;
    })();
    this.cache = { at: Date.now(), db };
    db.catch(() => { this.cache = null; });
    return db;
  }

  private invalidate() { this.cache = null; }

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
    this.invalidate();
    const { error } = await this.client.from(TABLE_NAMES[table]).insert(rows.map((r) => toRow(table, r as Record<string, unknown>)));
    fail(TABLE_NAMES[table], error);
  }

  async upsert<T extends TableKey>(table: T, rows: RowOf<T>[]): Promise<void> {
    if (!rows.length) return;
    this.invalidate();
    const onConflict = PRIMARY_KEYS[table].map((k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)).join(',');
    const { error } = await this.client.from(TABLE_NAMES[table])
      .upsert(rows.map((r) => toRow(table, r as Record<string, unknown>)), { onConflict });
    fail(TABLE_NAMES[table], error);
  }

  async update<T extends TableKey>(table: T, match: Match<T>, patch: Partial<RowOf<T>>): Promise<void> {
    this.invalidate();
    const q = this.client.from(TABLE_NAMES[table]).update(toRow(table, patch as Record<string, unknown>));
    const { error } = await this.applyMatch(table, q, match as Record<string, unknown>);
    fail(TABLE_NAMES[table], error);
  }

  async remove<T extends TableKey>(table: T, match: Match<T>): Promise<void> {
    this.invalidate();
    const q = this.client.from(TABLE_NAMES[table]).delete();
    const { error } = await this.applyMatch(table, q, match as Record<string, unknown>);
    fail(TABLE_NAMES[table], error);
  }

  private rpcError(error: { message: string }): never {
    const m = error.message ?? '';
    if (m.includes('quest_full')) throw conflict('quest_full');
    if (m.includes('quest_closed')) throw conflict('quest_closed');
    if (m.includes('quest_not_found')) throw notFound('quest_not_found');
    throw new HttpError(502, `seat update failed: ${m}`);
  }

  async joinQuest(questId: ID, userId: ID, withFriendId: ID | null): Promise<number> {
    this.invalidate();
    const { data, error } = await this.client.rpc('join_quest', { p_quest: questId, p_user: userId, p_with_friend: withFriendId });
    if (error) this.rpcError(error);
    return Number(data);
  }

  async leaveQuest(questId: ID, userId: ID): Promise<number> {
    this.invalidate();
    const { data, error } = await this.client.rpc('leave_quest', { p_quest: questId, p_user: userId });
    if (error) this.rpcError(error);
    return Number(data);
  }

  async uploadFile(bucket: 'uploads' | 'memories', path: string, bytes: Uint8Array, contentType: string): Promise<string> {
    const { error } = await this.client.storage.from(bucket).upload(path, bytes, { contentType, upsert: false });
    if (error) throw new HttpError(502, `upload failed: ${error.message}`);
    return this.client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }
}

export function createSupabaseStore(env: SupabaseEnv): CoreStore {
  return new CoreStore(new SupabaseBackend(env));
}
