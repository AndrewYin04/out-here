// Pre-baked Muse: the stable cache key and the switches. Server-side only.
//
// A Muse answer is cached under (route, model, input_hash). input_hash is stableHash() below:
// sha256 of canonical JSON (sorted keys) of { model, effort, schemaName, jsonSchema, messages },
// with the values that only say "what time it is now" replaced by placeholders, so an ask warmed
// at 9:30 AM still matches the same ask at 10:45 AM. Everything else stays in the key: the user's
// own words, quest titles, venues, prices, walk minutes, seats, interests, and absolute start
// times. A presenter reset or reseed moves the quests' absolute times, so it changes the key and
// the next ask goes live (then refills the cache). docs/MUSE_PREBAKE.md lists the same fields.
import { createHash } from 'node:crypto';
import type { MuseMessage } from './client';

/** Text placeholders used in the key. */
export const NOW = '<now>';
export const REL = '<rel>';
export const CLOCK = '<clock>';

/**
 * The normalized fields, exactly:
 * - the line "Current local time (<zone>): <label>." in the parse and create-quest prompts -> <now>
 * - JSON keys whose number counts minutes from now: startsInMin, startsInMinutes, freeFromMin,
 *   freeUntilMin, minutesLeft -> <rel> (rank and the map filter send these)
 * - JSON key "window" (the rank prompt's "10:45 AM to 11:45 AM (1 hour)"): its clock times -> <clock>
 * - JSON key "whenText" when it is relative ("in 25 min", "happening now") -> <rel> (regroup)
 * - ISO timestamps in a JSON value whose key is "now" -> <now>
 */
export const NORMALIZED = {
  nowLine: /(Current local time \([^)]*\): )[^\n]*?\.(?=\n|$)/g,
  relativeNumberKeys: ['startsInMin', 'startsInMinutes', 'freeFromMin', 'freeUntilMin', 'minutesLeft'] as const,
  clockKeys: ['window'] as const,
  relativeTextKeys: ['whenText'] as const,
  nowKeys: ['now'] as const,
};

const CLOCK_RE = /\b\d{1,2}:\d{2}(?:\s?[AaPp]\.?[Mm]\.?)?/g;
const RELATIVE_TEXT_RE = /^(in \d+ min|happening now)$/i;

function normalizeValue(key: string | null, value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => normalizeValue(null, v));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = normalizeValue(k, v);
    return out;
  }
  if (key === null) return value;
  if ((NORMALIZED.relativeNumberKeys as readonly string[]).includes(key) && typeof value === 'number') return REL;
  if ((NORMALIZED.clockKeys as readonly string[]).includes(key) && typeof value === 'string') return value.replace(CLOCK_RE, CLOCK);
  if ((NORMALIZED.relativeTextKeys as readonly string[]).includes(key) && typeof value === 'string' && RELATIVE_TEXT_RE.test(value.trim())) return REL;
  if ((NORMALIZED.nowKeys as readonly string[]).includes(key) && typeof value === 'string') return NOW;
  return value;
}

/** One message's content with the "now" values taken out. JSON content is parsed and walked. */
export function normalizeContent(content: string): unknown {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return { json: normalizeValue(null, JSON.parse(trimmed)) };
    } catch {
      // not JSON after all: fall through to text
    }
  }
  return content.replace(NORMALIZED.nowLine, `$1${NOW}.`);
}

/** JSON with object keys sorted at every level, so key order never changes the hash. */
export function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJSON(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export type StableKeyInput = {
  model: string;
  effort: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  messages: MuseMessage[];
};

/** What gets hashed (exported for tests and for docs/MUSE_PREBAKE.md). */
export function stableKeyMaterial(input: StableKeyInput): string {
  return canonicalJSON({
    model: input.model,
    effort: input.effort,
    schemaName: input.schemaName,
    jsonSchema: input.jsonSchema,
    messages: input.messages.map((m) => ({ role: m.role, content: normalizeContent(m.content) })),
  });
}

export function stableHash(input: StableKeyInput): string {
  return createHash('sha256').update(stableKeyMaterial(input)).digest('hex').slice(0, 32);
}

// ---------- switches ----------

/**
 * MUSE_PREBAKED:
 * - "1" / "true" / "cache": cache first. A stored answer is served at once; a miss calls Muse live,
 *   and a slow or failed live call falls back to the stored answer when one exists.
 * - "fallback": live first. The stored answer is used only when the live call passes
 *   MUSE_STAGE_TIMEOUT_MS or fails.
 * - unset / "0": off. Nothing is read from the cache (answers are still written to it).
 */
export type PrebakeMode = 'off' | 'cache-first' | 'fallback';

export function prebakeMode(): PrebakeMode {
  const v = (process.env.MUSE_PREBAKED ?? '').trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'cache' || v === 'on') return 'cache-first';
  if (v === 'fallback') return 'fallback';
  return 'off';
}

export const STAGE_TIMEOUT_MS = 4_000;
export function stageTimeoutMs(): number {
  const v = Number(process.env.MUSE_STAGE_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : STAGE_TIMEOUT_MS;
}

/** A stored answer older than this is ignored (default 6 h). */
export const PREBAKE_MAX_AGE_MIN = 360;
export function prebakeMaxAgeMs(): number {
  const v = Number(process.env.MUSE_PREBAKE_MAX_AGE_MIN);
  return (Number.isFinite(v) && v > 0 ? v : PREBAKE_MAX_AGE_MIN) * 60_000;
}

/** Live answers are written to the cache unless MUSE_CACHE_WRITE=0. */
export function cacheWriteEnabled(): boolean {
  return process.env.MUSE_CACHE_WRITE !== '0';
}

/** Request header the warm-up sends to force a live call and overwrite the stored answer. */
export const MUSE_CACHE_HEADER = 'x-muse-cache';

/** "refresh" when the current request asked for a live call (warm-up --refresh). Null outside a request. */
export async function requestDirective(): Promise<'refresh' | null> {
  try {
    const { headers } = await import('next/headers');
    const h = await headers();
    return h.get(MUSE_CACHE_HEADER) === 'refresh' ? 'refresh' : null;
  } catch {
    return null;
  }
}
