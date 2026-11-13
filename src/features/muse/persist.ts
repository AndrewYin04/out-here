// Where Muse calls are recorded (muse_runs) and where pre-baked answers live (muse_cache).
// Server-side only. Supabase when the data layer has Supabase settings, else an in-process store
// on globalThis (MemoryStore mode, tests). Every write is best effort: a failed log or cache write
// never slows or fails a Muse call.
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MuseRunRecord } from './client';

export type CacheKey = { route: string; model: string; inputHash: string };

export type CacheEntry = CacheKey & {
  schemaName: string;
  output: unknown;
  promptTokens: number | null;
  completionTokens: number | null;
  /** Latency of the live call that produced the answer. */
  latencyMs: number;
  /** muse_runs.id of that live call. */
  sourceRunId: string | null;
  createdAt: string;
};

/** A muse_runs row as this module writes it. */
export type StoredRun = MuseRunRecord & { id: string };

/** Run metadata safe to show any viewer: no output, no prompt. */
export type RunSummary = Pick<StoredRun,
  'id' | 'route' | 'schemaName' | 'model' | 'latencyMs' | 'inputHash' | 'ok' | 'error' | 'mock' | 'cached' | 'prebaked' | 'cacheRunId' | 'createdAt'>;

export interface MuseStore {
  readonly kind: 'memory' | 'supabase';
  getCache(key: CacheKey, maxAgeMs: number): Promise<CacheEntry | null>;
  putCache(entry: CacheEntry): Promise<void>;
  logRun(run: StoredRun): Promise<void>;
  /** Latest runs for one user, newest first. */
  recentRuns(userId: string | null, sinceIso: string | null, limit: number): Promise<RunSummary[]>;
}

const keyOf = (k: CacheKey) => `${k.route}|${k.model}|${k.inputHash}`;
const summary = (r: StoredRun): RunSummary => ({
  id: r.id, route: r.route, schemaName: r.schemaName, model: r.model, latencyMs: r.latencyMs, inputHash: r.inputHash,
  ok: r.ok, error: r.error, mock: r.mock, cached: r.cached, prebaked: r.prebaked, cacheRunId: r.cacheRunId, createdAt: r.createdAt,
});

// ---------- memory ----------

const MEMORY_RUN_CAP = 2_000;

export function createMemoryMuseStore(): MuseStore & { runs: StoredRun[]; cache: Map<string, CacheEntry> } {
  const runs: StoredRun[] = [];
  const cache = new Map<string, CacheEntry>();
  return {
    kind: 'memory',
    runs,
    cache,
    async getCache(key, maxAgeMs) {
      const hit = cache.get(keyOf(key));
      if (!hit || Date.now() - Date.parse(hit.createdAt) > maxAgeMs) return null;
      return hit;
    },
    async putCache(entry) {
      cache.set(keyOf(entry), { ...entry });
    },
    async logRun(run) {
      runs.push({ ...run });
      if (runs.length > MEMORY_RUN_CAP) runs.splice(0, runs.length - MEMORY_RUN_CAP);
    },
    async recentRuns(userId, sinceIso, limit) {
      const since = sinceIso ? Date.parse(sinceIso) : 0;
      return runs
        .filter((r) => (userId === null || r.userId === userId) && Date.parse(r.createdAt) >= since)
        .slice(-limit).reverse().map(summary);
    },
  };
}

// ---------- supabase ----------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (v: string | null | undefined) => (v && UUID_RE.test(v) ? v : null);

/** True for "column does not exist" errors, i.e. migration 0009 is not applied yet. */
const missingColumn = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist|Could not find the .* column/i.test(e.message ?? ''));

export function createSupabaseMuseStore(client: SupabaseClient): MuseStore {
  return {
    kind: 'supabase',
    async getCache(key, maxAgeMs) {
      const { data, error } = await client
        .from('muse_cache')
        .select('route, model, input_hash, schema_name, output, prompt_tokens, completion_tokens, latency_ms, source_run_id, created_at')
        .eq('route', key.route).eq('model', key.model).eq('input_hash', key.inputHash)
        .maybeSingle();
      if (error || !data) return null;
      const row = data as Record<string, unknown>;
      const createdAt = String(row.created_at);
      if (Date.now() - Date.parse(createdAt) > maxAgeMs) return null;
      return {
        route: String(row.route), model: String(row.model), inputHash: String(row.input_hash),
        schemaName: String(row.schema_name ?? ''), output: row.output,
        promptTokens: (row.prompt_tokens as number | null) ?? null, completionTokens: (row.completion_tokens as number | null) ?? null,
        latencyMs: Number(row.latency_ms ?? 0), sourceRunId: (row.source_run_id as string | null) ?? null, createdAt,
      };
    },
    async putCache(entry) {
      await client.from('muse_cache').upsert({
        route: entry.route, model: entry.model, input_hash: entry.inputHash, schema_name: entry.schemaName,
        output: entry.output, prompt_tokens: entry.promptTokens, completion_tokens: entry.completionTokens,
        latency_ms: entry.latencyMs, source_run_id: uuidOrNull(entry.sourceRunId), created_at: entry.createdAt,
      }, { onConflict: 'route,model,input_hash' });
    },
    async logRun(run) {
      const base = {
        id: run.id, route: run.route, model: run.model, user_id: uuidOrNull(run.userId), latency_ms: Math.round(run.latencyMs),
        input_hash: run.inputHash, output: run.output ?? null, prompt_tokens: run.promptTokens, completion_tokens: run.completionTokens,
        ok: run.ok, error: run.error, created_at: run.createdAt,
      };
      // Columns from migration 0009. Before it is applied the insert retries without them.
      const extra = { schema_name: run.schemaName, mock: run.mock, cached: run.cached, prebaked: run.prebaked, cache_run_id: uuidOrNull(run.cacheRunId) };
      const { error } = await client.from('muse_runs').insert({ ...base, ...extra });
      if (missingColumn(error)) await client.from('muse_runs').insert(base);
    },
    async recentRuns(userId, sinceIso, limit) {
      let q = client.from('muse_runs').select('*').order('created_at', { ascending: false }).limit(limit);
      const uid = uuidOrNull(userId);
      if (userId !== null) q = uid ? q.eq('user_id', uid) : q.is('user_id', null);
      if (sinceIso) q = q.gte('created_at', sinceIso);
      const { data, error } = await q;
      if (error || !data) return [];
      return (data as Record<string, unknown>[]).map((r) => ({
        id: String(r.id), route: String(r.route), schemaName: String(r.schema_name ?? ''), model: String(r.model),
        latencyMs: Number(r.latency_ms ?? 0), inputHash: String(r.input_hash), ok: Boolean(r.ok), error: (r.error as string | null) ?? null,
        mock: Boolean(r.mock), cached: Boolean(r.cached), prebaked: Boolean(r.prebaked), cacheRunId: (r.cache_run_id as string | null) ?? null,
        createdAt: String(r.created_at),
      }));
    },
  };
}

// ---------- the process-wide store ----------

const g = globalThis as unknown as { __museStore?: { key: string; store: Promise<MuseStore> } };

async function build(): Promise<{ key: string; store: Promise<MuseStore> }> {
  const { supabaseEnv } = await import('@/features/data/server');
  const env = supabaseEnv();
  const key = env ? `${env.target}|${env.url}` : 'memory';
  if (g.__museStore?.key === key) return g.__museStore;
  const store = (async (): Promise<MuseStore> => {
    if (!env) return createMemoryMuseStore();
    const { createClient } = await import('@supabase/supabase-js');
    return createSupabaseMuseStore(createClient(env.url, env.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }));
  })();
  g.__museStore = { key, store };
  return g.__museStore;
}

/** The store for this process (shared by every route bundle through globalThis). */
export async function museStore(): Promise<MuseStore> {
  if (g.__museStore?.key === 'override') return g.__museStore.store;
  return (await build()).store;
}

/** Test hook: use this store until reset with null. */
export function setMuseStore(store: MuseStore | null): void {
  g.__museStore = store ? { key: 'override', store: Promise.resolve(store) } : undefined;
}

export const newRunId = (): string => randomUUID();

/**
 * Runs a write without making the caller wait. Inside a Next request it is handed to after(), so
 * a serverless function stays alive until the write lands; elsewhere it just runs.
 */
export function background(task: () => Promise<unknown>): void {
  const p = Promise.resolve().then(task).catch(() => {});
  void (async () => {
    try {
      const { after } = await import('next/server');
      after(p);
    } catch {
      // outside a request: the promise already runs on its own
    }
  })();
}

/** Resolves to fallback when the promise takes longer than ms (the cache lookup must stay fast). */
export async function within<T>(ms: number, p: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p.catch(() => fallback), new Promise<T>((r) => { timer = setTimeout(() => r(fallback), ms); })]);
  } finally {
    clearTimeout(timer);
  }
}
