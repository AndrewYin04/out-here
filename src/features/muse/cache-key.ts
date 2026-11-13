// Stable keys for the Muse response cache (see docs/MUSE_PREBAKE.md).
// A key must be the same for an ask made at 9 AM and the same ask on stage at 10:45, so it never
// contains the clock or live counts. It does contain everything that changes what Muse would say:
// the route, model, effort, schema, persona, the prompt template, and the caller's stable facts.
import { createHash } from 'node:crypto';
import type { MuseMessage } from './client';

/** Bump when the key layout changes, so old rows stop matching. */
export const CACHE_KEY_VERSION = 'k1';

/**
 * Seed version: part of every key. MUSE_SEED_VERSION (default "1") lets the team retire every
 * cached answer at once, for example after a seed change that keeps the same ids.
 */
export function seedVersion(): string {
  return process.env.MUSE_SEED_VERSION?.trim() || '1';
}

/** User text as the key sees it: NFKC, lower case, single spaces, trimmed. */
export function normalizeText(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

const ISO_RE = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/g;
const WEEKDAY_CLOCK_RE = /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,? \d{1,2}:\d{2}\s?(?:AM|PM|am|pm)/g;
const CLOCK_RE = /\b\d{1,2}:\d{2}\s?(?:AM|PM|am|pm)/g;

/**
 * Removes the clock from prompt text. Exactly these are replaced:
 * - ISO timestamps (2026-11-13T10:45:00.000Z, with or without seconds, offset or Z) -> "<iso>"
 * - weekday + 12-hour clock as localLabel() prints it ("Fri 10:45 AM") -> "<now>"
 * - any other 12-hour clock ("4:50 PM", "11:53 am") -> "<clock>"
 * 24-hour "HH:MM" strings are left alone: the prompts use them only in fixed examples.
 */
export function normalizeVolatile(s: string): string {
  return s.replace(ISO_RE, '<iso>').replace(WEEKDAY_CLOCK_RE, '<now>').replace(CLOCK_RE, '<clock>');
}

/** JSON with object keys sorted at every level, so key order never changes a hash. */
export function canonicalJSON(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        const x = (v as Record<string, unknown>)[k];
        if (x !== undefined) out[k] = walk(x);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

export type CacheKeyInput = {
  route: string;
  schemaName: string;
  model: string;
  effort: string;
  userId: string | null;
  jsonSchema: Record<string, unknown>;
  messages: MuseMessage[];
  /**
   * The caller's stable facts (normalized text, ordered candidate ids, ...). When given, it
   * replaces the user messages in the key; system messages still count (with the clock
   * removed), so editing a prompt template retires its cached answers. When absent, every
   * message counts with the clock removed.
   */
  cacheKey?: unknown;
};

/** Message content as key text: plain text, or text parts plus image urls for vision messages. */
function contentKey(content: CacheKeyInput['messages'][number]['content']): string {
  if (typeof content === 'string') return normalizeVolatile(content);
  return content.map((p) => (p.type === 'text' ? normalizeVolatile(p.text) : `image:${p.image_url.url}`)).join('\n');
}

export function museCacheKey(input: CacheKeyInput): string {
  const prompt = input.cacheKey === undefined
    ? input.messages.map((m) => ({ role: m.role, content: contentKey(m.content) }))
    : {
        system: input.messages.filter((m) => m.role === 'system').map((m) => contentKey(m.content)),
        key: input.cacheKey,
      };
  const doc = canonicalJSON({
    v: CACHE_KEY_VERSION, seed: seedVersion(), route: input.route, schema: input.schemaName,
    model: input.model, effort: input.effort, user: input.userId, jsonSchema: input.jsonSchema, prompt,
  });
  return createHash('sha256').update(doc).digest('hex').slice(0, 32);
}
