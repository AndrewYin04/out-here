// The one Muse adapter (server-side only). Every Muse call in Out Here goes through museJSON.
// Facts used here come from docs/muse-api.md: OpenAI-compatible API, strict json_schema
// response_format, reasoning_effort "minimal"/"low" ("none" is a 400), back off on 429/504.
import { createHash } from 'node:crypto';
import { after } from 'next/server';
import OpenAI from 'openai';
import type { z } from 'zod';
import { museCacheKey } from './cache-key';
import { cacheReadMs, getRunStore, runStoreIsExplicit, type MuseRunStore } from './run-store';

export type MuseModelRole = 'fast' | 'smart';
export type MuseEffort = 'minimal' | 'low' | 'medium' | 'high';
export type MuseMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/** One logged call. Matches the muse_runs row minus id; never holds keys or prompts. */
export type MuseRunRecord = {
  route: string;
  schemaName: string;
  model: string;
  userId: string | null;
  latencyMs: number;
  inputHash: string;
  output: unknown;
  promptTokens: number | null;
  completionTokens: number | null;
  ok: boolean;
  error: string | null;
  mock: boolean;
  /** True when the output was served from muse_cache instead of a new call. */
  cached: boolean;
  /** Why a cached output was served: read first (prebaked), live too slow, or live failed. */
  cacheReason?: CacheReason | null;
  createdAt: string;
};

export type CacheReason = 'prebaked' | 'stage-timeout' | 'live-failed';

export type MuseUsage = { promptTokens: number | null; completionTokens: number | null };

export type MuseResult<T> = {
  data: T; model: string; latencyMs: number; usage: MuseUsage; mock: boolean;
  /** Served from muse_cache: a real Muse answer to the same key, produced earlier. */
  cached?: boolean;
  cacheReason?: CacheReason | null;
};

export type MuseJSONOptions<T> = {
  schemaName: string;
  /** zod schema the parsed output must pass. */
  schema: z.ZodType<T>;
  /** Strict JSON schema sent to the API (root object, additionalProperties false, all keys required). */
  jsonSchema: Record<string, unknown>;
  messages: MuseMessage[];
  model: MuseModelRole;
  effort?: MuseEffort;
  /** Deterministic stand-in used in mock mode. Required: mock mode never calls the network. */
  mock: () => T;
  route?: string;
  userId?: string | null;
  /** Per-attempt cap (default MUSE_TIMEOUT_MS). */
  timeoutMs?: number;
  /**
   * Absolute deadline (epoch ms) for the whole call, retries included. Each attempt gets
   * min(timeoutMs, time left); no attempt starts with less than MIN_ATTEMPT_MS left.
   */
  deadline?: number;
  /**
   * Stable facts for the response-cache key (see cache-key.ts). Give it when the user message
   * holds live values (seats, walk minutes, start times) that must not change the key.
   */
  cacheKey?: unknown;
};

/** Raw chat call, replaceable in tests. Returns the message text and usage. */
export type MuseTransport = (req: {
  model: string;
  messages: MuseMessage[];
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  effort: MuseEffort;
  timeoutMs: number;
  /** Aborted when the attempt times out; transports should pass it to fetch. */
  signal: AbortSignal;
}) => Promise<{ content: string | null; usage: MuseUsage }>;

export class MuseError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
    this.name = 'MuseError';
  }
}

export const MUSE_TIMEOUT_MS = 12_000;
/** An attempt is not started with less time than this left before the deadline. */
export const MIN_ATTEMPT_MS = 400;

/** Thrown when an attempt runs out of time. Not retried: the deadline is shared. */
export class MuseTimeoutError extends MuseError {
  constructor(ms: number) {
    super(`Muse timed out after ${ms} ms`);
    this.name = 'MuseTimeoutError';
  }
}

// ---------- mode and models ----------

export function isMockMode(): boolean {
  return process.env.MUSE_MOCK === '1' || !process.env.MUSE_API_KEY;
}

export function modelFor(role: MuseModelRole): string {
  return role === 'fast'
    ? process.env.MUSE_MODEL_FAST || 'muse-ember-1.0'
    : process.env.MUSE_MODEL_SMART || 'muse-spark-1.3';
}

// ---------- run logging ----------

let runLogger: (run: MuseRunRecord) => void | Promise<void> = (run) => {
  if (process.env.NODE_ENV !== 'production' && process.env.MUSE_QUIET !== '1') {
    console.debug(
      `[muse] ${run.route} ${run.schemaName} ${run.model} ${run.ok ? 'ok' : 'error'} ${run.latencyMs}ms` +
        `${run.mock ? ' mock' : ''}${run.cached ? ' cached' : ''}${run.error ? ` (${run.error})` : ''}`,
    );
  }
};

/** Replaces the run logger. The data layer plugs in a muse_runs writer here. */
export function onRun(logger: (run: MuseRunRecord) => void | Promise<void>): void {
  runLogger = logger;
}

function emit(run: MuseRunRecord): void {
  try {
    const r = runLogger(run);
    if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
  } catch {
    // a broken logger must never break a plan
  }
  // Every run also lands in muse_runs (fire and forget; never slows or fails the request).
  if (runsLogged()) background(getRunStore().then((s) => s.logRun(run)));
}

/**
 * Keeps a promise alive past the response on Vercel (next/server after()) and swallows its
 * errors. Outside a request (scripts, tests) after() throws and the promise just runs.
 */
function background(p: Promise<unknown>): void {
  p.catch(() => {});
  try {
    after(p);
  } catch {
    // not in a request scope
  }
}

/** muse_runs is written for the real transport, or for any transport once a test set a store. */
function runsLogged(): boolean {
  return process.env.MUSE_RUNS_LOG !== '0' && (transport === openAITransport || runStoreIsExplicit());
}

/**
 * Records that a pipeline step answered with code instead of Muse while in live mode.
 * Goes through the same onRun logger (model "heuristic", ok false) and always prints one
 * console.warn line, so a demo running on fallbacks is visible in the server log.
 */
export function reportFallback(info: { route: string; step: string; error: string | null; userId?: string | null }): void {
  const error = `fallback(${info.step}): ${info.error ?? 'unknown'}`.slice(0, 240);
  if (process.env.MUSE_QUIET !== '1') console.warn(`[muse] FALLBACK ${info.route} ${info.step}: ${info.error ?? 'unknown'}`);
  emit({
    route: info.route, schemaName: info.step, model: 'heuristic', userId: info.userId ?? null, latencyMs: 0,
    inputHash: '', output: null, promptTokens: null, completionTokens: null, ok: false, error,
    mock: false, cached: false, createdAt: new Date().toISOString(),
  });
}

/** Runs one transport attempt with a hard timer, so a transport that ignores the timeout cannot hang the plan. */
async function attemptWithTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { ctrl.abort(); reject(new MuseTimeoutError(ms)); }, ms);
  });
  try {
    return await Promise.race([run(ctrl.signal), timeout]);
  } catch (err) {
    if (ctrl.signal.aborted) throw new MuseTimeoutError(ms);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- transport ----------

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    const baseURL = process.env.MUSE_BASE_URL;
    const apiKey = process.env.MUSE_API_KEY;
    if (!baseURL || !apiKey) throw new MuseError('Muse is not configured (MUSE_BASE_URL / MUSE_API_KEY missing)');
    client = new OpenAI({ baseURL, apiKey, maxRetries: 0, timeout: MUSE_TIMEOUT_MS });
  }
  return client;
}

const openAITransport: MuseTransport = async (req) => {
  const res = await getClient().chat.completions.create(
    {
      model: req.model,
      messages: req.messages,
      reasoning_effort: req.effort,
      response_format: {
        type: 'json_schema',
        json_schema: { name: req.schemaName, strict: true, schema: req.jsonSchema },
      },
    },
    { timeout: req.timeoutMs, signal: req.signal },
  );
  return {
    content: res.choices[0]?.message?.content ?? null,
    usage: {
      promptTokens: res.usage?.prompt_tokens ?? null,
      completionTokens: res.usage?.completion_tokens ?? null,
    },
  };
};

let transport: MuseTransport = openAITransport;

/** Test hook: swap the network call. Pass null to restore the real one. */
export function setMuseTransport(t: MuseTransport | null): void {
  transport = t ?? openAITransport;
}

// ---------- response cache (muse_cache; see docs/MUSE_PREBAKE.md) ----------

/**
 * The cache is used with the real transport (MUSE_CACHE=0 turns it off), or with a fake one
 * once a test chose a store with setRunStore().
 */
function cacheActive(): boolean {
  return process.env.MUSE_CACHE !== '0' && (transport === openAITransport || runStoreIsExplicit());
}

export const STAGE_TIMEOUT_MS = 4000;
/** MUSE_STAGE_TIMEOUT_MS (default 4000): after this long a live call yields to a cached answer. 0 turns that off. */
export function stageTimeoutMs(): number {
  const raw = process.env.MUSE_STAGE_TIMEOUT_MS;
  if (raw === undefined || raw.trim() === '') return STAGE_TIMEOUT_MS;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : STAGE_TIMEOUT_MS;
}

const PREBAKED_MEMO_MS = 10_000;
let prebakedMemo: { at: number; on: boolean } | null = null;

/**
 * Prebaked mode reads the cache before calling Muse. MUSE_PREBAKED=1 turns it on and
 * MUSE_PREBAKED=0 off; otherwise the muse_settings flag the warm-up sets decides (read at most
 * every 10 s per server instance).
 */
export async function prebakedOn(store?: MuseRunStore): Promise<boolean> {
  if (process.env.MUSE_PREBAKED === '1') return true;
  if (process.env.MUSE_PREBAKED === '0') return false;
  if (prebakedMemo && Date.now() - prebakedMemo.at < PREBAKED_MEMO_MS) return prebakedMemo.on;
  const s = store ?? await getRunStore();
  const on = await withTimeout(s.getPrebakedFlag(), cacheReadMs(), false);
  prebakedMemo = { at: Date.now(), on };
  return on;
}

/** Forgets the memoized prebaked flag (after the prebake route changes it, and in tests). */
export function clearPrebakedMemo(): void {
  prebakedMemo = null;
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p.catch(() => onTimeout),
    new Promise<T>((resolve) => { timer = setTimeout(() => resolve(onTimeout), ms); }),
  ]).finally(() => clearTimeout(timer));
}

// ---------- helpers ----------

export function hashInput(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32);
}

function statusOf(err: unknown): number | null {
  const s = (err as { status?: unknown })?.status;
  return typeof s === 'number' ? s : null;
}

/** Error text safe to log: no key, no prompt, one line, short. */
function safeError(err: unknown): string {
  let msg = String((err as { message?: unknown })?.message ?? err);
  const key = process.env.MUSE_API_KEY;
  if (key) msg = msg.split(key).join('[redacted]');
  return msg.replace(/\s+/g, ' ').slice(0, 200);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pulls the JSON object out of a reply that may carry code fences or stray text. */
export function extractJSON(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));
    throw new Error('reply is not JSON');
  }
}

// ---------- museJSON ----------

type RunBase = { route: string; schemaName: string; model: string; userId: string | null; inputHash: string; mock: boolean };

/**
 * One structured Muse call: strict json_schema output, zod-validated, one retry when the
 * reply is not valid JSON for the schema (or on 429/504), 12 s timeout per attempt.
 * In mock mode returns opts.mock() without touching the network.
 *
 * Response cache (live mode only, docs/MUSE_PREBAKE.md), keyed by route + model + a stable hash
 * (cache-key.ts):
 * - prebaked mode (MUSE_PREBAKED=1 or the warm-up's flag): a cached answer is served first;
 * - a live call slower than MUSE_STAGE_TIMEOUT_MS (4 s), or one that fails, yields to a cached
 *   answer when one exists; otherwise the call behaves as before;
 * - every successful live answer is stored.
 * Cached answers are logged to muse_runs with cached: true and the reason.
 */
export async function museJSON<T>(opts: MuseJSONOptions<T>): Promise<MuseResult<T>> {
  const started = Date.now();
  const mock = isMockMode();
  const model = mock ? 'mock' : modelFor(opts.model);
  const effort = opts.effort ?? 'minimal';
  const route = opts.route ?? 'muse';
  const userId = opts.userId ?? null;
  const inputHash = museCacheKey({
    route, schemaName: opts.schemaName, model, effort, userId, jsonSchema: opts.jsonSchema,
    messages: opts.messages, cacheKey: opts.cacheKey,
  });
  const base: RunBase = { route, schemaName: opts.schemaName, model, userId, inputHash, mock };

  if (mock) {
    const usage: MuseUsage = { promptTokens: null, completionTokens: null };
    const data = opts.schema.parse(opts.mock());
    const latencyMs = Date.now() - started;
    emit({ ...base, latencyMs, output: data, ...usage, ok: true, error: null, cached: false, createdAt: new Date().toISOString() });
    return { data, model, latencyMs, usage, mock: true };
  }

  const store = cacheActive() ? await getRunStore() : null;
  if (!store) return liveCall(opts, base, effort, started, null);

  const readCache = async (): Promise<T | null> => {
    const entry = await withTimeout(store.getCached(route, model, inputHash), cacheReadMs(), null);
    if (!entry) return null;
    const parsed = opts.schema.safeParse(entry.output);
    return parsed.success ? parsed.data : null;
  };
  const serveCached = (data: T, reason: CacheReason): MuseResult<T> => {
    const usage: MuseUsage = { promptTokens: null, completionTokens: null };
    const latencyMs = Date.now() - started;
    emit({
      ...base, latencyMs, output: data, ...usage, ok: true, error: null, cached: true, cacheReason: reason,
      createdAt: new Date().toISOString(),
    });
    return { data, model, latencyMs, usage, mock: false, cached: true, cacheReason: reason };
  };

  if (await prebakedOn(store)) {
    const hit = await readCache();
    if (hit !== null) return serveCached(hit, 'prebaked');
  }

  const live = liveCall(opts, base, effort, started, store);
  const stageMs = stageTimeoutMs();
  let timer: ReturnType<typeof setTimeout> | undefined;
  type Outcome = { kind: 'ok'; r: MuseResult<T> } | { kind: 'err'; e: unknown } | { kind: 'stage' };
  const racers: Promise<Outcome>[] = [live.then((r) => ({ kind: 'ok' as const, r }), (e) => ({ kind: 'err' as const, e }))];
  if (stageMs > 0) racers.push(new Promise<Outcome>((resolve) => { timer = setTimeout(() => resolve({ kind: 'stage' }), stageMs); }));
  const first = await Promise.race(racers);
  clearTimeout(timer);
  if (first.kind === 'ok') return first.r;

  const hit = await readCache();
  if (hit !== null) {
    // The slow live call keeps running in the background: it is still logged and, when it
    // succeeds, refreshes the cache.
    if (first.kind === 'stage') background(live);
    return serveCached(hit, first.kind === 'stage' ? 'stage-timeout' : 'live-failed');
  }
  if (first.kind === 'err') throw first.e;
  return live;
}

/** The live call with its retry. Logs its own run; stores a successful answer when store is set. */
async function liveCall<T>(
  opts: MuseJSONOptions<T>, base: RunBase, effort: MuseEffort, started: number, store: MuseRunStore | null,
): Promise<MuseResult<T>> {
  const { model } = base;
  const usage: MuseUsage = { promptTokens: null, completionTokens: null };
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const cap = opts.timeoutMs ?? MUSE_TIMEOUT_MS;
      const left = opts.deadline === undefined ? cap : opts.deadline - Date.now();
      if (left < MIN_ATTEMPT_MS) throw new MuseTimeoutError(Math.max(0, Date.now() - started));
      const timeoutMs = Math.min(cap, left);
      const res = await attemptWithTimeout(timeoutMs, (signal) => transport({
        model,
        messages: opts.messages,
        schemaName: opts.schemaName,
        jsonSchema: opts.jsonSchema,
        effort,
        timeoutMs,
        signal,
      }));
      if (!res.content) throw new MuseError('empty reply');
      usage.promptTokens = res.usage.promptTokens;
      usage.completionTokens = res.usage.completionTokens;
      const parsed = opts.schema.safeParse(extractJSON(res.content));
      if (!parsed.success) throw new MuseError(`invalid JSON for ${opts.schemaName}: ${parsed.error.issues[0]?.message ?? 'schema mismatch'}`);
      const latencyMs = Date.now() - started;
      const createdAt = new Date().toISOString();
      if (store) {
        background(store.putCached({
          route: base.route, model, inputHash: base.inputHash, schemaName: opts.schemaName,
          output: parsed.data, userId: base.userId, latencyMs, createdAt,
        }));
      }
      emit({ ...base, latencyMs, output: parsed.data, ...usage, ok: true, error: null, cached: false, createdAt });
      return { data: parsed.data, model, latencyMs, usage, mock: false, cached: false };
    } catch (err) {
      lastError = err;
      const status = statusOf(err);
      const retryable = !(err instanceof MuseTimeoutError) && (
        err instanceof MuseError || err instanceof SyntaxError || status === 429 || status === 504 ||
        (err as Error)?.message === 'reply is not JSON');
      if (!retryable || attempt === 1) break;
      if (status === 429 || status === 504) {
        if (opts.deadline !== undefined && opts.deadline - Date.now() < 800 + MIN_ATTEMPT_MS) break;
        await sleep(800);
      }
    }
  }
  const latencyMs = Date.now() - started;
  const error = safeError(lastError);
  emit({ ...base, latencyMs, output: null, ...usage, ok: false, error, cached: false, createdAt: new Date().toISOString() });
  if (lastError instanceof MuseTimeoutError) throw lastError;
  throw new MuseError(error, statusOf(lastError));
}
