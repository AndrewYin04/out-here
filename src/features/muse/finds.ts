// Muse finds for Marketplace pickup on the Out Here map.
//
// 1. parseWant (fast model): "I need a desk chair under $40, ideally within a 15-minute drive"
//    becomes { item, keywords, maxPrice, maxDriveMin }. Code clamps the numbers and drops any the
//    text never said (no digits, no limits).
// 2. matchListings (code only): listings open for pickup that match a want by keyword, price,
//    drive time, and a pickup window long enough to get there. Muse never invents a listing.
// 3. explainFind (fast model): one line for the best match ("That $35 desk chair was just listed.
//    It's a 12-minute drive, and the seller is around until 5:00 PM."). Code checks every number
//    in it against the facts and falls back to its own line.
import { z } from 'zod';
import { drivingMinutes, formatDemoTime, walkingMinutes, type ID, type LatLng, type MuseWant } from '@/shared';
import type { MapListing, MuseFind } from '@/shared/api';
import { museJSON, reportFallback } from './client';
import { findLineMessages, wantMessages, type FindLineFacts } from './prompts/finds';

// ---------- 1. parse a want ----------

export const RawWantZ = z.object({
  item: z.string().trim().min(1).max(60),
  keywords: z.array(z.string()).max(10),
  maxPrice: z.number().nullable(),
  maxDriveMin: z.number().nullable(),
});
export type RawWant = z.infer<typeof RawWantZ>;
const nullable = (type: string) => ({ type: [type, 'null'] });
export const RAW_WANT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object', additionalProperties: false, required: ['item', 'keywords', 'maxPrice', 'maxDriveMin'],
  properties: {
    item: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } },
    maxPrice: nullable('number'), maxDriveMin: nullable('integer'),
  },
};

export type ParsedWant = Pick<MuseWant, 'text' | 'item' | 'keywords' | 'maxPrice' | 'maxDriveMin'>;

const STOP = new Set(['a', 'an', 'the', 'some', 'my', 'new', 'used', 'cheap', 'good', 'nice']);

/** Offline stand-in: reads "$40" / "under 40" and "15 min" / "15-minute"; the item is what follows "need/want/looking for". */
export function mockWant(text: string): RawWant {
  const t = text.toLowerCase();
  const price = t.match(/\$\s?(\d+(?:\.\d+)?)/) ?? t.match(/(?:under|below|max|up to|less than)\s+(\d+(?:\.\d+)?)/);
  const drive = t.match(/(\d+)\s?-?\s?min(?:ute)?s?\b/);
  const after = t.match(/(?:need|want|looking for|find me|after|searching for)\s+(.+)/)?.[1] ?? t;
  const words = after.split(/\s+(?:under|below|for|within|near|around|max|less|ideally|up|at|by|that|,)\b|[,.!?$]/)[0]
    .split(/\s+/).filter((w) => w && !STOP.has(w)).slice(0, 3);
  const item = words.join(' ') || t.split(/\s+/).slice(0, 2).join(' ');
  const head = words[words.length - 1];
  return {
    item, keywords: [...new Set([item, head].filter(Boolean))],
    maxPrice: price ? Number(price[1]) : null, maxDriveMin: drive ? Number(drive[1]) : null,
  };
}

/** Clamps numbers, keeps only limits the text could have said, and normalises keywords. */
export function validateWant(raw: RawWant, text: string): ParsedWant {
  const hasDigits = /\d/.test(text);
  const item = raw.item.trim().toLowerCase().slice(0, 60);
  const keywords = [...new Set([item, ...raw.keywords.map((k) => k.trim().toLowerCase())])]
    .filter((k) => k.length >= 2 && k.length <= 40).slice(0, 6);
  const maxPrice = hasDigits && raw.maxPrice !== null && raw.maxPrice > 0 ? Math.min(Math.round(raw.maxPrice * 100) / 100, 100_000) : null;
  const maxDriveMin = hasDigits && raw.maxDriveMin !== null && raw.maxDriveMin > 0 ? Math.min(Math.round(raw.maxDriveMin), 120) : null;
  return { text: text.trim().slice(0, 200), item, keywords, maxPrice, maxDriveMin };
}

export async function parseWant(text: string, userId: ID | null): Promise<{ want: ParsedWant; source: MuseFind['source'] }> {
  const route = '/api/muse/wants';
  try {
    const res = await museJSON({
      schemaName: 'want', schema: RawWantZ, jsonSchema: RAW_WANT_JSON_SCHEMA, messages: wantMessages(text),
      model: 'fast', effort: 'minimal', mock: () => mockWant(text), route, userId, deadline: Date.now() + 8_000,
    });
    return { want: validateWant(res.data, text), source: res.mock ? 'mock' : 'muse' };
  } catch (err) {
    reportFallback({ route, step: 'want', error: String((err as Error)?.message ?? err).slice(0, 200), userId });
    return { want: validateWant(mockWant(text), text), source: 'fallback' };
  }
}

// ---------- 2. match listings (code) ----------

export type FindCandidate = Omit<MuseFind, 'line' | 'source'> & { want: MuseWant; walkMin?: number };

/** Up to this many minutes on foot, Muse says "a 4-minute walk" instead of the drive. */
export const WALKABLE_MIN = 25;

/** Minutes of slack needed between arriving and the end of the pickup window. */
export const ARRIVE_BEFORE_END_MIN = 5;

/** "Wooden desk with two drawers - $40" -> "Wooden desk with two drawers". */
export const cleanTitle = (t: string) => t.replace(/\s+[-–]\s+\$\d[\d.,]*\s*$/, '').trim();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function titleMatches(title: string, keywords: string[]): boolean {
  const t = title.toLowerCase();
  return keywords.some((k) => new RegExp(`\\b${escapeRe(k)}(e?s)?\\b`).test(t));
}

export function matchListings(
  wants: MuseWant[], listings: MapListing[], origin: LatLng, at: Date, viewerId: ID,
): FindCandidate[] {
  const out: FindCandidate[] = [];
  const seen = new Set<string>();
  for (const w of wants) {
    if (!w.active) continue;
    for (const m of listings) {
      const l = m.listing;
      if (seen.has(l.id) || m.status !== 'available' || l.sellerId === viewerId || !l.location || !l.pickupUntil) continue;
      // Already asked for it: the find has done its job.
      if (m.myHold && (m.myHold.status === 'requested' || m.myHold.status === 'accepted')) continue;
      if (!titleMatches(`${l.title} ${l.category}`, w.keywords.length ? w.keywords : [w.item])) continue;
      if (w.maxPrice !== null && l.priceUsd > w.maxPrice) continue;
      const driveMin = drivingMinutes(origin, l.location);
      const walkMin = walkingMinutes(origin, l.location);
      if (w.maxDriveMin !== null && driveMin > w.maxDriveMin) continue;
      const left = (new Date(l.pickupUntil).getTime() - at.getTime()) / 60_000;
      if (left < driveMin + ARRIVE_BEFORE_END_MIN) continue;
      seen.add(l.id);
      out.push({
        listingId: l.id, wantId: w.id, title: cleanTitle(l.title), priceUsd: l.priceUsd, imageUrl: l.imageUrl,
        driveMin, walkMin, pickupUntil: l.pickupUntil, sellerFirstName: m.seller.name.split(' ')[0] ?? m.seller.name,
        listedMinAgo: Math.max(0, Math.round((at.getTime() - new Date(l.createdAt).getTime()) / 60_000)), want: w,
      });
    }
  }
  // Newest first (a fresh listing is the news), then the shortest drive.
  return out.sort((a, b) => a.listedMinAgo - b.listedMinAgo || a.driveMin - b.driveMin);
}

// ---------- 3. Muse's line ----------

const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

export function findFacts(c: FindCandidate): FindLineFacts {
  return {
    title: c.title, price: money(c.priceUsd), budget: c.want.maxPrice !== null ? money(c.want.maxPrice) : null,
    driveMin: c.driveMin, walkMin: c.walkMin !== undefined && c.walkMin <= WALKABLE_MIN ? c.walkMin : null, maxDriveMin: c.want.maxDriveMin, availableUntil: formatDemoTime(c.pickupUntil),
    listedMinAgo: c.listedMinAgo, sellerFirstName: c.sellerFirstName, wanted: c.want.text,
  };
}

/** The line code writes when Muse is off, slow, or wrote something unchecked. */
export function codeLine(c: FindCandidate): string {
  const f = findFacts(c);
  const fresh = c.listedMinAgo <= 15 ? 'was just listed' : c.listedMinAgo < 60 ? `was listed ${c.listedMinAgo} min ago` : 'is up for pickup';
  const trip = f.walkMin !== null ? `${f.walkMin}-minute walk` : `${f.driveMin}-minute drive`;
  return `That ${f.price} ${f.title.toLowerCase()} ${fresh}. It's a ${trip}, and the seller is around until ${f.availableUntil}.`;
}

const FIELD_NAMES = /\b(driveMin|maxDriveMin|listedMinAgo|availableUntil|sellerFirstName|maxPrice|priceUsd)\b/;

/** Null when every number in the line is one of the facts; otherwise what is wrong. */
export function checkFindLine(text: string, f: FindLineFacts): string | null {
  if (!text.trim() || text.length > 240) return 'empty or too long';
  if (FIELD_NAMES.test(text)) return 'leaked a data field name';
  const prices = new Set([f.price, f.budget].filter(Boolean));
  for (const m of text.matchAll(/\$\s?\d[\d,]*(?:\.\d+)?/g)) {
    const p = `$${Number(m[0].replace(/[$,\s]/g, '')).toString()}`;
    if (!prices.has(p) && !prices.has(m[0].replace(/\s/g, ''))) return `quoted ${m[0]}`;
  }
  const mins = new Set([f.driveMin, f.walkMin, f.maxDriveMin, f.listedMinAgo].filter((n): n is number => n !== null));
  for (const m of text.matchAll(/(\d+)\s?-?\s?(?:min|minute)/gi)) if (!mins.has(Number(m[1]))) return `quoted ${m[0]}`;
  for (const m of text.matchAll(/\b(\d{1,2}(?::\d{2})?)\s?(AM|PM|am|pm)\b/g)) {
    const [h, mm = '00'] = m[1].split(':');
    if (`${h}:${mm} ${m[2].toUpperCase()}` !== f.availableUntil) return `quoted ${m[0]}`;
  }
  return null;
}

const lineCache = new Map<string, { line: string; source: MuseFind['source'] }>();

export async function explainFind(c: FindCandidate, userId: ID | null): Promise<{ line: string; source: MuseFind['source'] }> {
  const f = findFacts(c);
  const key = JSON.stringify([c.listingId, c.wantId, f.driveMin, f.walkMin, f.availableUntil, c.listedMinAgo <= 15]);
  const hit = lineCache.get(key);
  if (hit) return hit;
  const route = '/api/muse/finds';
  let out: { line: string; source: MuseFind['source'] };
  try {
    const res = await museJSON({
      schemaName: 'find_line', schema: z.object({ line: z.string() }),
      jsonSchema: { type: 'object', additionalProperties: false, required: ['line'], properties: { line: { type: 'string' } } },
      messages: findLineMessages(f), model: 'fast', effort: 'minimal',
      mock: () => ({ line: codeLine(c) }), route, userId, deadline: Date.now() + 8_000,
    });
    const issue = checkFindLine(res.data.line, f);
    if (issue) {
      reportFallback({ route, step: 'find_line', error: issue, userId });
      out = { line: codeLine(c), source: 'fallback' };
    } else {
      out = { line: res.data.line.trim(), source: res.mock ? 'mock' : 'muse' };
    }
  } catch (err) {
    reportFallback({ route, step: 'find_line', error: String((err as Error)?.message ?? err).slice(0, 200), userId });
    out = { line: codeLine(c), source: 'fallback' };
  }
  if (lineCache.size > 200) lineCache.clear();
  if (out.source !== 'fallback') lineCache.set(key, out);
  return out;
}

/** The viewer's best find (Muse explains it), or none. Code picks it; Muse only writes the line. */
export async function museFinds(
  wants: MuseWant[], listings: MapListing[], origin: LatLng, at: Date, viewerId: ID,
): Promise<MuseFind[]> {
  const best = matchListings(wants, listings, origin, at, viewerId)[0];
  if (!best) return [];
  const { want: _want, ...facts } = best;
  return [{ ...facts, ...(await explainFind(best, viewerId)) }];
}
