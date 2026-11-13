// Route-handler helpers: JSON responses, zod parsing, and one error mapping for every route.
// Every error leaves as `{ error: string }` with a 4xx/5xx status.
import { NextResponse } from 'next/server';
import { z, ZodError, type ZodType } from 'zod';
import { isAudience, type Audience, type Profile } from '@/shared';
import {
  flushOutbox, FRESH_HEADER, getStore, getViewer, HttpError, newScope, runInScope, type DataStore,
} from '@/features/data/server';

export type Ctx<P extends Record<string, string> = Record<string, string>> = { params: Promise<P> };

export const json = <T>(data: T, status = 200) => NextResponse.json(data, { status });

function errorResponse(err: unknown) {
  // Also by name: after a dev hot reload errors.ts can load twice, and instanceof then fails.
  if (err instanceof HttpError || (err instanceof Error && err.name === 'HttpError' && typeof (err as HttpError).status === 'number')) {
    return json({ error: err.message }, (err as HttpError).status);
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return json({ error: first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'invalid input' }, 400);
  }
  console.error('[api] unhandled error', err instanceof Error ? err.message : err);
  return json({ error: 'internal_error' }, 500);
}

type Handler<P extends Record<string, string>> = (args: {
  req: Request; viewer: Profile; store: DataStore; params: P; url: URL;
}) => Promise<unknown>;

/**
 * Wraps a handler: resolves the viewer (x-persona), params, and maps errors to JSON.
 * Each call runs in a request scope (see features/data/request-scope.ts). Mutations, and GETs
 * sent with x-outhere-fresh: 1 (refetches a realtime message triggered), read the database
 * instead of the shared snapshot cache. Queued Supabase Broadcasts go out in one call before the
 * response. The Server-Timing header reports total time, full table loads and queries.
 */
export function route<P extends Record<string, string> = Record<string, string>>(fn: Handler<P>) {
  return async (req: Request, ctx: Ctx<P>) => {
    const started = performance.now();
    const fresh = req.method !== 'GET' || req.headers.get(FRESH_HEADER) === '1';
    const scope = newScope(fresh);
    let res: Response;
    let broadcasts = 0;
    try {
      res = await runInScope(scope, async () => {
        try {
          const viewer = await getViewer(req);
          const params = ((await ctx?.params) ?? {}) as P;
          const out = await fn({ req, viewer, store: getStore(), params, url: new URL(req.url) });
          return out instanceof Response ? out : json(out);
        } catch (err) {
          return errorResponse(err);
        } finally {
          broadcasts = await flushOutbox(scope);
        }
      });
    } catch (err) {
      res = errorResponse(err);
    }
    const ms = (performance.now() - started).toFixed(1);
    try {
      res.headers.set('server-timing', `total;dur=${ms}, loads;desc="${scope.loads}", queries;desc="${scope.queries}", broadcasts;desc="${broadcasts}"`);
    } catch { /* immutable headers (e.g. a proxied Response) */ }
    // OUTHERE_DEBUG_QUERIES=1: one log line per request with counts only (no ids, no rows).
    if (process.env.OUTHERE_DEBUG_QUERIES === '1') {
      console.log(`[queries] ${req.method} ${new URL(req.url).pathname} status=${res.status} ms=${ms} loads=${scope.loads} tableLoads=${scope.tableLoads} queries=${scope.queries}`);
    }
    return res;
  };
}

/** Parses the JSON body with a zod schema (400 on bad JSON or invalid input). */
export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    const text = await req.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, 'body must be JSON');
  }
  return schema.parse(raw);
}

export function query<T>(url: URL, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(url.searchParams.entries()));
}

// ---------- shared schemas ----------
export const IdZ = z.string().min(1).max(64);
export const IsoZ = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'must be an ISO date');
export const LatLngZ = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
export const AudienceZ = z.string().refine((s) => isAudience(s), 'must be public, friends, only_me or list:<id>')
  .transform((s) => s as Audience);

/** A body `userId` (kit contract) must match the viewer when given. */
export function assertSelf(viewer: Profile, userId: string | undefined | null) {
  if (userId && userId !== viewer.id && userId !== viewer.handle) throw new HttpError(403, 'userId must be the active persona');
}

// ---------- uploads ----------
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function readForm(req: Request): Promise<FormData> {
  try {
    return await req.formData();
  } catch {
    throw new HttpError(400, 'expected multipart form data');
  }
}

/** Validates a multipart file field: an image under 8 MB. */
export async function readUpload(value: FormDataEntryValue | null): Promise<{ bytes: Uint8Array; contentType: string; name: string }> {
  if (!value || typeof value === 'string') throw new HttpError(400, 'file is required');
  if (!value.type.startsWith('image/')) throw new HttpError(400, 'only image uploads are allowed');
  if (value.size > MAX_UPLOAD_BYTES) throw new HttpError(413, 'file is larger than 8 MB');
  return { bytes: new Uint8Array(await value.arrayBuffer()), contentType: value.type, name: value.name || 'upload' };
}
