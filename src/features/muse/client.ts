// The one Muse adapter (server-side only). Every Muse call in Out Here goes through museJSON.
// Facts used here come from docs/muse-api.md: OpenAI-compatible API, strict json_schema
// response_format, reasoning_effort "minimal"/"low" ("none" is a 400), back off on 429/504.
import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import type { z } from 'zod';

export type MuseModelRole = 'fast' | 'smart' | 'vision';
export type MuseEffort = 'minimal' | 'low' | 'medium' | 'high';
export type MuseMessage =
  | { role: 'system' | 'assistant'; content: string }
  | { role: 'user'; content: string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[] };

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
  cached: boolean;
  createdAt: string;
};

export type MuseUsage = { promptTokens: number | null; completionTokens: number | null };

export type MuseResult<T> = { data: T; model: string; latencyMs: number; usage: MuseUsage; mock: boolean };

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
   * Extra facts logged with the output in muse_runs (as output.signals), so "why did Muse suggest
   * this" can show what it used. Counts and labels only: never names, ids, or someone's answer.
   */
  logSignals?: Record<string, unknown>;
  /** Parent request cancellation. Never retries a cancelled call. */
  signal?: AbortSignal;
  /** Private image analysis: no disk cache or output/provider-error text in run logs. */
  sensitive?: boolean;

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
  if (role === 'vision') return process.env.MUSE_MODEL_VISION || 'muse-spark-1.3';
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
async function attemptWithTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal): Promise<T> {
  const ctrl = new AbortController();
  parent?.throwIfAborted();
  let rejectAbort: (reason: unknown) => void = () => {};
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const abort = () => { ctrl.abort(); rejectAbort(new DOMException('Cancelled', 'AbortError')); };
  parent?.addEventListener('abort', abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { ctrl.abort(); reject(new MuseTimeoutError(ms)); }, ms);
  });
  try {
    return await Promise.race([run(ctrl.signal), timeout, aborted]);
  } catch (err) {
    if (parent?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (err instanceof OpenAI.APIConnectionTimeoutError) throw new MuseTimeoutError(ms);
    if (ctrl.signal.aborted) throw new MuseTimeoutError(ms);
    throw err;
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', abort);
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
  opts.signal?.throwIfAborted();
  const started = Date.now();
  const mock = isMockMode();
  const model = mock ? 'mock' : modelFor(opts.model);
  const effort = opts.effort ?? 'minimal';
  const inputHash = hashInput({ model, effort, schema: opts.schemaName, messages: opts.messages });
  const base = {
    route: opts.route ?? 'muse',
    schemaName: opts.schemaName,
    model,
    userId: opts.userId ?? null,
    inputHash,
    mock,
  };
  const usage: MuseUsage = { promptTokens: null, completionTokens: null };
  const logged = (data: T): unknown =>
    opts.logSignals && data && typeof data === 'object' ? { ...(data as object), signals: opts.logSignals } : data;

  if (mock) {
    const data = opts.schema.parse(opts.mock());
    const latencyMs = Date.now() - started;
    emit({ ...base, latencyMs, output: opts.sensitive ? null : logged(data), ...usage, ok: true, error: null, cached: false, createdAt: new Date().toISOString() });

    return { data, model, latencyMs, usage, mock: true };
  }

  let lastError: unknown = null;
  let cached = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      opts.signal?.throwIfAborted();
      let reply = attempt === 0 && !opts.sensitive ? await cacheRead(inputHash) : null;
      cached = reply !== null;
      if (!reply) {
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
        }), opts.signal);
        if (!res.content) throw new MuseError('empty reply');
        reply = { content: res.content, usage: res.usage };
      }
      usage.promptTokens = reply.usage.promptTokens;
      usage.completionTokens = reply.usage.completionTokens;
      const parsed = opts.schema.safeParse(extractJSON(reply.content));
      if (!parsed.success) throw new MuseError(`invalid JSON for ${opts.schemaName}: ${parsed.error.issues[0]?.message ?? 'schema mismatch'}`);
      if (!cached && !opts.sensitive) await cacheWrite(inputHash, reply);
      const latencyMs = Date.now() - started;
      emit({ ...base, latencyMs, output: opts.sensitive ? null : logged(parsed.data), ...usage, ok: true, error: null, cached, createdAt: new Date().toISOString() });

      return { data: parsed.data, model, latencyMs, usage, mock: false };
    } catch (err) {
      if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
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
  const error = opts.sensitive ? 'Photo analysis request failed' : safeError(lastError);
  emit({ ...base, latencyMs, output: null, ...usage, ok: false, error, cached, createdAt: new Date().toISOString() });
  if (lastError instanceof MuseTimeoutError) throw lastError;
  throw new MuseError(error, statusOf(lastError));
}
