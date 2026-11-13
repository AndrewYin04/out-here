// Where Muse runs are logged (muse_runs) and real Muse answers are kept for reuse (muse_cache,
// migration 0009). Server only. Two implementations, picked like the DataStore:
// - Supabase, when the data layer has Supabase settings (supabaseEnv()).
// - Memory, otherwise (builders, tests, MemoryStore e2e). Outside production and tests it also
//   mirrors entries to .cache/muse (gitignored), so a local warm-up survives a server restart.
// Every call here is best effort with a short timeout: a sick database never slows a plan by
// more than MUSE_CACHE_READ_MS, and a failed write never fails a request.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MuseRunRecord } from './client';

export type CacheEntry = {
  route: string;
  model: string;
  inputHash: string;
  schemaName: string;
  /** The zod-validated output of a live Muse call. Never a mock or fallback answer. */
  output: unknown;
  userId: string | null;
  /** How long the live call that produced it took. */
  latencyMs: number;
  createdAt: string;
};

export type RunCounts = { live: number; cached: number; failed: number; mock: number };

export interface MuseRunStore {
  readonly kind: 'memory' | 'supabase';
  getCached(route: string, model: string, inputHash: string): Promise<CacheEntry | null>;
  putCached(entry: CacheEntry): Promise<void>;
  logRun(run: MuseRunRecord): Promise<void>;
  /** The prebaked switch the warm-up sets (muse_settings.prebaked). */
  getPrebakedFlag(): Promise<boolean>;
  setPrebakedFlag(on: boolean): Promise<void>;
  /** For the warm-up and docs: what the log says since a moment, and how many entries exist. */
  stats(sinceIso: string): Promise<{ entries: number; runs: RunCounts }>;
  /** Removes every cached answer (not the run log). */
  clearCache(): Promise<number>;
}

const READ_MS_DEFAULT = 1000;
export function cacheReadMs(): number {
  const v = Number(process.env.MUSE_CACHE_READ_MS);
  return Number.isFinite(v) && v > 0 ? v : READ_MS_DEFAULT;
}

const countRun = (c: RunCounts, r: Pick<MuseRunRecord, 'ok' | 'cached' | 'mock'>) => {
  if (r.mock) c.mock++;
  else if (!r.ok) c.failed++;
  else if (r.cached) c.cached++;
  else c.live++;
};

// ---------- memory ----------

const MAX_RUNS = 2000;

export function createMemoryRunStore(opts: { persistDir?: string | null } = {}): MuseRunStore {
  const cache = new Map<string, CacheEntry>();
  const runs: MuseRunRecord[] = [];
  let flag = false;
  const k = (route: string, model: string, hash: string) => `${route}|${model}|${hash}`;
  const fileOf = async (hash: string, route: string, model: string) => {
    const { join } = await import('node:path');
    const { createHash } = await import('node:crypto');
    const name = createHash('sha256').update(k(route, model, hash)).digest('hex').slice(0, 32);
    return join(opts.persistDir!, `${name}.json`);
  };
  return {
    kind: 'memory',
    async getCached(route, model, hash) {
      const hit = cache.get(k(route, model, hash));
      if (hit || !opts.persistDir) return hit ?? null;
      try {
        const { readFile } = await import('node:fs/promises');
        const entry = JSON.parse(await readFile(await fileOf(hash, route, model), 'utf8')) as CacheEntry;
        cache.set(k(route, model, hash), entry);
        return entry;
      } catch {
        return null;
      }
    },
    async putCached(entry) {
      cache.set(k(entry.route, entry.model, entry.inputHash), entry);
      if (!opts.persistDir) return;
      try {
        const { mkdir, writeFile } = await import('node:fs/promises');
        await mkdir(opts.persistDir, { recursive: true });
        await writeFile(await fileOf(entry.inputHash, entry.route, entry.model), JSON.stringify(entry));
      } catch {
        // best effort
      }
    },
    async logRun(run) {
      runs.push(run);
      if (runs.length > MAX_RUNS) runs.splice(0, runs.length - MAX_RUNS);
    },
    async getPrebakedFlag() { return flag; },
    async setPrebakedFlag(on) { flag = on; },
    async stats(since) {
      const c: RunCounts = { live: 0, cached: 0, failed: 0, mock: 0 };
      for (const r of runs) if (r.createdAt >= since) countRun(c, r);
      return { entries: cache.size, runs: c };
    },
    async clearCache() {
      const n = cache.size;
      cache.clear();
      if (opts.persistDir) {
        try {
          const { rm } = await import('node:fs/promises');
          await rm(opts.persistDir, { recursive: true, force: true });
        } catch {
          // best effort
        }
      }
      return n;
    },
  };
}

// ---------- supabase ----------

const NEW_RUN_COLUMNS = ['schema_name', 'cached', 'mock', 'cache_reason'] as const;

export function createSupabaseRunStore(client: SupabaseClient): MuseRunStore {
  // Until migration 0009 is applied, muse_runs lacks the new columns and muse_cache does not
  // exist: runs are written without the new columns and cache calls read as misses.
  let runColumnsMissing = false;
  const signal = () => AbortSignal.timeout(cacheReadMs());
  const writeSignal = () => AbortSignal.timeout(5000);
  return {
    kind: 'supabase',
    async getCached(route, model, hash) {
      try {
        const { data, error } = await client.from('muse_cache')
          .select('route, model, input_hash, schema_name, output, user_id, latency_ms, created_at')
          .eq('route', route).eq('model', model).eq('input_hash', hash)
          .abortSignal(signal()).maybeSingle();
        if (error || !data) return null;
        return {
          route: data.route, model: data.model, inputHash: data.input_hash, schemaName: data.schema_name,
          output: data.output, userId: data.user_id, latencyMs: data.latency_ms ?? 0, createdAt: data.created_at,
        };
      } catch {
        return null;
      }
    },
    async putCached(e) {
      try {
        await client.from('muse_cache').upsert({
          route: e.route, model: e.model, input_hash: e.inputHash, schema_name: e.schemaName,
          output: e.output, user_id: e.userId, latency_ms: e.latencyMs, created_at: e.createdAt,
        }, { onConflict: 'route,model,input_hash' }).abortSignal(writeSignal());
      } catch {
        // best effort
      }
    },
    async logRun(r) {
      const row: Record<string, unknown> = {
        route: r.route, model: r.model, user_id: r.userId, latency_ms: r.latencyMs, input_hash: r.inputHash,
        output: r.output ?? null, prompt_tokens: r.promptTokens, completion_tokens: r.completionTokens,
        ok: r.ok, error: r.error, created_at: r.createdAt,
        schema_name: r.schemaName, cached: r.cached, mock: r.mock, cache_reason: r.cacheReason ?? null,
      };
      if (runColumnsMissing) for (const c of NEW_RUN_COLUMNS) delete row[c];
      try {
        const { error } = await client.from('muse_runs').insert(row).abortSignal(writeSignal());
        if (error && !runColumnsMissing && /column|PGRST204|42703/i.test(`${error.code ?? ''} ${error.message}`)) {
          runColumnsMissing = true;
          for (const c of NEW_RUN_COLUMNS) delete row[c];
          await client.from('muse_runs').insert(row).abortSignal(writeSignal());
        }
      } catch {
        // best effort
      }
    },
    async getPrebakedFlag() {
      try {
        const { data } = await client.from('muse_settings').select('value').eq('key', 'prebaked')
          .abortSignal(signal()).maybeSingle();
        return data?.value === true;
      } catch {
        return false;
      }
    },
    async setPrebakedFlag(on) {
      const { error } = await client.from('muse_settings')
        .upsert({ key: 'prebaked', value: on, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw new Error(`muse_settings: ${error.message}`);
    },
    async stats(since) {
      const c: RunCounts = { live: 0, cached: 0, failed: 0, mock: 0 };
      const [runs, entries] = await Promise.all([
        client.from('muse_runs').select(runColumnsMissing ? 'ok' : 'ok, cached, mock').gte('created_at', since).limit(1000),
        client.from('muse_cache').select('input_hash', { count: 'exact', head: true }),
      ]);
      for (const r of (runs.data ?? []) as unknown as { ok: boolean; cached?: boolean; mock?: boolean }[]) {
        countRun(c, { ok: r.ok, cached: r.cached ?? false, mock: r.mock ?? false });
      }
      return { entries: entries.count ?? 0, runs: c };
    },
    async clearCache() {
      const { error, count } = await client.from('muse_cache').delete({ count: 'exact' }).neq('input_hash', '');
      if (error) throw new Error(`muse_cache: ${error.message}`);
      return count ?? 0;
    },
  };
}

// ---------- the process-wide store ----------

const g = globalThis as unknown as { __museRunStore?: Promise<MuseRunStore>; __museRunStoreExplicit?: boolean };

async function createDefault(): Promise<MuseRunStore> {
  try {
    const { supabaseEnv } = await import('@/features/data/server');
    const env = supabaseEnv();
    if (env) {
      const { createClient } = await import('@supabase/supabase-js');
      return createSupabaseRunStore(createClient(env.url, env.serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }));
    }
  } catch {
    // fall through to memory
  }
  const env = process.env.NODE_ENV;
  let persistDir: string | null = null;
  if (env !== 'production' && env !== 'test') {
    const { join } = await import('node:path');
    persistDir = join(process.cwd(), '.cache', 'muse');
  }
  return createMemoryRunStore({ persistDir });
}

export function getRunStore(): Promise<MuseRunStore> {
  return (g.__museRunStore ??= createDefault());
}

/** True after setRunStore(): tests opt the cache in for fake transports this way. */
export function runStoreIsExplicit(): boolean {
  return g.__museRunStoreExplicit === true;
}

/** Test hook: use this store (pass null to go back to the default one). */
export function setRunStore(store: MuseRunStore | null): void {
  g.__museRunStore = store ? Promise.resolve(store) : undefined;
  g.__museRunStoreExplicit = store !== null;
}
