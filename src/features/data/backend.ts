import { PRIMARY_KEYS, TABLE_NAMES, type Db, type RowOf, type TableKey } from './db';
import { conflict } from './errors';
import type { ID } from '@/shared';

/** What vote_together did. questId/seatsLeft are set when the plan confirmed or an option was full. */
export type TogetherVoteResult = { status: 'proposing' | 'confirmed' | 'expired'; questId: ID | null; seatsLeft: number | null };

/** A match value that is an array matches any of its items (SQL `in`). */
export type Match<T extends TableKey> = { [K in keyof RowOf<T>]?: RowOf<T>[K] | RowOf<T>[K][] };

/**
 * The storage primitives the store logic needs. MemoryBackend keeps rows in-process;
 * SupabaseBackend reads tables with supabase-js and writes rows / calls the seat RPCs.
 */
export interface Backend {
  readonly kind: 'memory' | 'supabase';
  /** All tables. Callers only read the returned object; writes go through the methods below. */
  snapshot(): Promise<Db>;
  insert<T extends TableKey>(table: T, rows: RowOf<T>[]): Promise<void>;
  upsert<T extends TableKey>(table: T, rows: RowOf<T>[]): Promise<void>;
  update<T extends TableKey>(table: T, match: Match<T>, patch: Partial<RowOf<T>>): Promise<void>;
  remove<T extends TableKey>(table: T, match: Match<T>): Promise<void>;
  /** join_quest semantics: atomic, idempotent, both-or-neither with a friend; throws HttpError 409 quest_full. Returns seats left. */
  joinQuest(questId: ID, userId: ID, withFriendId: ID | null): Promise<number>;
  /** leave_quest semantics: reopens a full quest; no-op for non-members. Returns seats left. */
  leaveQuest(questId: ID, userId: ID): Promise<number>;
  /**
   * vote_together semantics (migration 0006), one transaction: lock the plan, record this
   * member's vote, and if every member is in on one option, either join them all to that quest
   * and confirm, or (not enough seats for everyone) join nobody and mark the option full.
   */
  voteTogether(planId: ID, userId: ID, questId: ID, isIn: boolean): Promise<TogetherVoteResult>;
  /** Re-reads one table into the current request's snapshot (Supabase); a no-op in memory, which is always current. */
  reload(table: TableKey): Promise<void>;
  /** Stores a file. Public buckets return a browser URL; private photos return their key. */
  uploadFile(bucket: 'uploads' | 'memories' | 'crew-photos', path: string, bytes: Uint8Array, contentType: string): Promise<string>;
  downloadCrewPhoto(id: ID): Promise<Blob>;
}

export function rowMatches(row: Record<string, unknown>, match: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(match)) {
    if (v === undefined) continue;
    if (Array.isArray(v) && !Array.isArray(row[k])) {
      if (!v.includes(row[k])) return false;
    } else if (row[k] !== v) return false;
  }
  return true;
}

// ---------- pure row operations on a Db ----------
// Both backends use these: MemoryBackend on its tables, SupabaseBackend on a request's working
// snapshot after the database write succeeded. Each one replaces the table array, so a View
// built from an earlier snapshot never changes under its reader.

export function rowKey<T extends TableKey>(table: T, row: RowOf<T>): string {
  return PRIMARY_KEYS[table].map((k) => String((row as Record<string, unknown>)[k])).join('|');
}

export function applyInsert<T extends TableKey>(db: Db, table: T, rows: RowOf<T>[], checkDuplicates = true): void {
  const list = db[table] as RowOf<T>[];
  if (checkDuplicates) {
    const existing = new Set(list.map((r) => rowKey(table, r)));
    for (const r of rows) {
      const k = rowKey(table, r);
      if (existing.has(k)) throw conflict(`duplicate key in ${TABLE_NAMES[table]}`);
      existing.add(k);
    }
  }
  (db[table] as RowOf<T>[]) = [...list, ...rows.map((r) => ({ ...r }))];
}

export function applyUpsert<T extends TableKey>(db: Db, table: T, rows: RowOf<T>[]): void {
  const keys = new Set(rows.map((r) => rowKey(table, r)));
  const kept = (db[table] as RowOf<T>[]).filter((r) => !keys.has(rowKey(table, r)));
  (db[table] as RowOf<T>[]) = [...kept, ...rows.map((r) => ({ ...r }))];
}

export function applyUpdate<T extends TableKey>(db: Db, table: T, match: Match<T>, patch: Partial<RowOf<T>>): void {
  (db[table] as RowOf<T>[]) = (db[table] as RowOf<T>[]).map((r) =>
    rowMatches(r as Record<string, unknown>, match as Record<string, unknown>) ? { ...r, ...patch } : r);
}

export function applyRemove<T extends TableKey>(db: Db, table: T, match: Match<T>): void {
  (db[table] as RowOf<T>[]) = (db[table] as RowOf<T>[]).filter((r) =>
    !rowMatches(r as Record<string, unknown>, match as Record<string, unknown>));
}
