// The one Muse adapter (server-side only). Every Muse call in Out Here goes through museJSON.
// Facts used here come from docs/muse-api.md: OpenAI-compatible API, strict json_schema
// response_format, reasoning_effort "minimal"/"low" ("none" is a 400), back off on 429/504.
import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import type { z } from 'zod';
import { background, museStore, newRunId, within, type CacheEntry } from './persist';
import {
  cacheWriteEnabled, prebakeMaxAgeMs, prebakeMode, requestDirective, stableHash, stageTimeoutMs,
} from './prebake';

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
  /** Answered from a cache instead of a new model call (the dev file cache or the pre-baked cache). */
  cached: boolean;
  /** Answered from the pre-baked cache (muse_cache). The output is a stored, genuine Muse answer. */
  prebaked: boolean;
  /** For a pre-baked answer: muse_runs.id of the live call that produced it. */
  cacheRunId: string | null;
  createdAt: string;
};

export type MuseUsage = { promptTokens: number | null; completionTokens: number | null };

export type MuseResult<T> = {
  data: T; model: string; latencyMs: number; usage: MuseUsage; mock: boolean;
  /** True when the answer came from the pre-baked cache (still a genuine stored Muse answer). */
  prebaked?: boolean;
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

/**
 * Replaces the extra run logger (console by default; tests collect runs here). Writing muse_runs
 * does not depend on it: emit() always hands each run to the muse store (persist.ts) as well,
 * so every Muse call on the server is logged without anything registering at startup.
 */
export function onRun(logger: (run: MuseRunRecord) => void | Promise<void>): void {
  runLogger = logger;
}

/** Logs one run: the extra logger now, the muse_runs row in the background. Returns the row id. */
function emit(run: MuseRunRecord): string {
  const id = newRunId();
  try {
    const r = runLogger(run);
    if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
  } catch {
    // a broken logger must never break a plan
  }
  if (process.env.MUSE_RUNS_LOG !== '0') background(async () => (await museStore()).logRun({ ...run, id }));
  return id;
}

/** The cache lookup gets this long; past it the call goes live as if nothing were stored. */
const CACHE_LOOKUP_MS = 1_000;

async function lookupPrebaked(route: string, model: string, inputHash: string): Promise<CacheEntry | null> {
  return within(CACHE_LOOKUP_MS, museStore().then((s) => s.getCache({ route, model, inputHash }, prebakeMaxAgeMs())), null);
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
    mock: false, cached: false, prebaked: false, cacheRunId: null, createdAt: new Date().toISOString(),
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

// ---------- dev cache (.cache/muse, gitignored) ----------

function cacheEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.MUSE_CACHE !== '0' && transport === openAITransport;
}

async function cacheRead(hash: string): Promise<{ content: string; usage: MuseUsage } | null> {
  if (!cacheEnabled()) return null;
  try {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const raw = await readFile(join(process.cwd(), '.cache', 'muse', `${hash}.json`), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function cacheWrite(hash: string, value: { content: string; usage: MuseUsage }): Promise<void> {
  if (!cacheEnabled()) return;
  try {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const dir = join(process.cwd(), '.cache', 'muse');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${hash}.json`), JSON.stringify(value));
  } catch {
    // cache is best effort
  }
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

/**
 * One structured Muse call: strict json_schema output, zod-validated, one retry when the
 * reply is not valid JSON for the schema (or on 429/504), 12 s timeout per attempt.
 * In mock mode returns opts.mock() without touching the network.
 */
export async function museJSON<T>(opts: MuseJSONOptions<T>): Promise<MuseResult<T>> {
  const started = Date.now();
  const mock = isMockMode();
  const model = mock ? 'mock' : modelFor(opts.model);
  const effort = opts.effort ?? 'minimal';
  // exactHash keys the dev file cache (.cache/muse): any change, the time included, is a miss.
  // inputHash is the stable key (prebake.ts): the same ask later in the day hashes the same.
  const exactHash = hashInput({ model, effort, schema: opts.schemaName, messages: opts.messages });
  const inputHash = stableHash({ model, effort, schemaName: opts.schemaName, jsonSchema: opts.jsonSchema, messages: opts.messages });
  const base = {
    route: opts.route ?? 'muse',
    schemaName: opts.schemaName,
    model,
    userId: opts.userId ?? null,
    inputHash,
    mock,
    prebaked: false,
    cacheRunId: null as string | null,
  };
  const usage: MuseUsage = { promptTokens: null, completionTokens: null };

  if (mock) {
    const data = opts.schema.parse(opts.mock());
    const latencyMs = Date.now() - started;
    emit({ ...base, latencyMs, output: data, ...usage, ok: true, error: null, cached: false, createdAt: new Date().toISOString() });
    return { data, model, latencyMs, usage, mock: true };
  }

  // Pre-baked answers (docs/MUSE_PREBAKE.md). Off: nothing is read. Cache first: a stored answer
  // is served at once. Fallback: the live call gets MUSE_STAGE_TIMEOUT_MS, then the stored answer.
  // The warm-up's "x-muse-cache: refresh" header always goes live, with no fallback.
  const mode = prebakeMode();
  const directive = mode === 'off' ? null : await requestDirective();
  let stored: { entry: CacheEntry; data: T } | null = null;
  if (mode !== 'off' && directive !== 'refresh') {
    const entry = await lookupPrebaked(base.route, model, inputHash);
    const parsed = entry ? opts.schema.safeParse(entry.output) : null;
    if (entry && parsed?.success) stored = { entry, data: parsed.data };
  }
  const servePrebaked = (hit: { entry: CacheEntry; data: T }, note: string | null): MuseResult<T> => {
    const latencyMs = Date.now() - started;
    emit({
      ...base, prebaked: true, cacheRunId: hit.entry.sourceRunId, latencyMs, output: hit.data,
      promptTokens: null, completionTokens: null, ok: true, error: note, cached: true, createdAt: new Date().toISOString(),
    });
    return { data: hit.data, model, latencyMs, usage: { promptTokens: null, completionTokens: null }, mock: false, prebaked: true };
  };
  if (stored && mode === 'cache-first') return servePrebaked(stored, null);
  const stageDeadline = stored ? started + stageTimeoutMs() : undefined;
  const deadline = stageDeadline === undefined ? opts.deadline
    : opts.deadline === undefined ? stageDeadline : Math.min(opts.deadline, stageDeadline);

  let lastError: unknown = null;
  let cached = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let reply = attempt === 0 ? await cacheRead(exactHash) : null;
      cached = reply !== null;
      if (!reply) {
        const cap = opts.timeoutMs ?? MUSE_TIMEOUT_MS;
        const left = deadline === undefined ? cap : deadline - Date.now();
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
        reply = { content: res.content, usage: res.usage };
      }
      usage.promptTokens = reply.usage.promptTokens;
      usage.completionTokens = reply.usage.completionTokens;
      const parsed = opts.schema.safeParse(extractJSON(reply.content));
      if (!parsed.success) throw new MuseError(`invalid JSON for ${opts.schemaName}: ${parsed.error.issues[0]?.message ?? 'schema mismatch'}`);
      if (!cached) await cacheWrite(exactHash, reply);
      const latencyMs = Date.now() - started;
      const runId = emit({ ...base, latencyMs, output: parsed.data, ...usage, ok: true, error: null, cached, createdAt: new Date().toISOString() });
      if (!cached && cacheWriteEnabled()) {
        const entry: CacheEntry = {
          route: base.route, model, inputHash, schemaName: opts.schemaName, output: parsed.data,
          promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, latencyMs, sourceRunId: runId,
          createdAt: new Date().toISOString(),
        };
        background(async () => (await museStore()).putCache(entry));
      }
      return { data: parsed.data, model, latencyMs, usage, mock: false };
    } catch (err) {
      lastError = err;
      const status = statusOf(err);
      const retryable = !(err instanceof MuseTimeoutError) && (
        err instanceof MuseError || err instanceof SyntaxError || status === 429 || status === 504 ||
        (err as Error)?.message === 'reply is not JSON');
      if (!retryable || attempt === 1) break;
      if (status === 429 || status === 504) {
        if (deadline !== undefined && deadline - Date.now() < 800 + MIN_ATTEMPT_MS) break;
        await sleep(800);
      }
    }
  }
  const latencyMs = Date.now() - started;
  const error = safeError(lastError);
  emit({ ...base, latencyMs, output: null, ...usage, ok: false, error, cached, createdAt: new Date().toISOString() });
  // Stage fallback: the live call was too slow or failed, and this same ask was answered earlier.
  if (stored) return servePrebaked(stored, `stage fallback: ${error}`.slice(0, 240));
  if (lastError instanceof MuseTimeoutError) throw lastError;
  throw new MuseError(error, statusOf(lastError));
}
