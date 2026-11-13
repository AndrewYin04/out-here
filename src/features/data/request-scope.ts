// Per-request state for route handlers (server-only), carried with AsyncLocalStorage.
// - fresh: read the database instead of the shared snapshot cache (mutations, and refetches a
//   realtime message triggered, so they see the write that caused the message).
// - working: this request's own snapshot. SupabaseBackend loads each table it needs once, then
//   applies the request's own writes to it, so a mutation reads a table once instead of after every write.
// - outbox: Supabase Broadcast messages, sent in one REST call when the handler finishes.
// - timing: counters for the Server-Timing header, used to measure latency on the deployed build.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Db, TableKey } from './db';

export type OutboxMessage = { topic: string; event: string; payload: Record<string, unknown> };

/** The tables this request has read (each once), plus loads still running. */
export type WorkingSnapshot = { tables: Partial<Db>; pending: Map<TableKey, Promise<void>> };

export type RequestScope = {
  fresh: boolean;
  /** When the request arrived (ms). A fresh request may reuse a load that started after this. */
  since: number;
  working: WorkingSnapshot | null;
  outbox: OutboxMessage[];
  /** Snapshot reads that had to query the database for at least one table. */
  loads: number;
  /** Table loads started by this request (not served from the cache). */
  tableLoads: number;
  queries: number;
};

const g = globalThis as unknown as { __outhereScope?: AsyncLocalStorage<RequestScope> };
const als: AsyncLocalStorage<RequestScope> = (g.__outhereScope ??= new AsyncLocalStorage<RequestScope>());

export function currentScope(): RequestScope | undefined {
  return als.getStore();
}

export function newScope(fresh: boolean): RequestScope {
  return { fresh, since: Date.now(), working: null, outbox: [], loads: 0, tableLoads: 0, queries: 0 };
}

export function runInScope<T>(scope: RequestScope, fn: () => Promise<T>): Promise<T> {
  return als.run(scope, fn);
}
