import type { Db, RowOf, TableKey } from './db';
import type { ID } from '@/shared';

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
  /** Stores a file and returns a URL the browser can load. */
  uploadFile(bucket: 'uploads' | 'memories', path: string, bytes: Uint8Array, contentType: string): Promise<string>;
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
