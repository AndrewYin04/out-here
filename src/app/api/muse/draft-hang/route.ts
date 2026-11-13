// POST /api/muse/draft-hang  body: { text, friendId?, budgetMax?, excludePlaceIds?, now? }
//   -> { draft: HangDraft | null, work?: HangWork | null, friend: PersonCard | null, others: PersonCard[], reason?: string, mode?: 'live'|'mock'|'fallback' }
//   `others`: the other friends free with you, so the card can redraft with one of them.
// When nothing posted fits but a friend is free with you, Muse drafts a hangout for the two of
// you. Code lists the real places that are open, under budget and walkable for both in time;
// Muse (fast model, strict schema) picks one and writes the title, why and invite; code checks
// the pick and sets the times (validateHang). The friend's location never leaves the server,
// only their walking minutes. Nothing is created here: "Make this plan" posts to /api/quests.
// Header x-muse-mode: mock|live|fallback. On a Muse failure the offline draft answers.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DEMO_CENTER, now as demoNow, type LatLng } from '@/shared';
import {
  hangFunnel, hangMessages, hangPlaces, hangWork, mockHang, museJSON, RAW_HANG_JSON_SCHEMA, RawHangZ, reportFallback, validateHang,
  type HangContext,
} from '@/features/muse';
import { body, IdZ, LIVE_TABLES, route } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const BodyZ = z.object({
  text: z.string().trim().min(1).max(300),
  friendId: IdZ.optional(),
  budgetMax: z.number().min(0).max(1000).nullable().optional(),
  excludePlaceIds: z.array(IdZ).max(20).default([]),
  now: z.string().datetime({ offset: true }).optional(),
});

export const POST = route(async ({ store, viewer, req }) => {
  const b = await body(req, BodyZ);
  const at = b.now ? new Date(b.now) : demoNow();
  const free = await store.freeWithMe(viewer.id);
  // A friend the viewer picked, or every free friend in order (the first one whose window still fits wins).
  const tryFriends = b.friendId ? free.items.filter((i) => i.friend.id === b.friendId) : free.items;
  if (tryFriends.length === 0) return { draft: null, friend: null, others: [], reason: 'no_friend_free' };

  const { db } = await store.museContext();
  const t = at.toISOString();
  const locOf = (userId: string): LatLng | null =>
    db.availability.filter((a) => a.userId === userId && a.endsAt > t).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0]?.location
    ?? db.locationShares?.find((s) => s.userId === userId)?.location
    ?? null;
  const meAt = locOf(viewer.id) ?? DEMO_CENTER;
  const excluded = new Set(b.excludePlaceIds);
  // Rehearsals at night: OUTHERE_IGNORE_HOURS=1 locally, and every Vercel preview (dev data),
  // skip opening hours. Production keeps them.
  const ignoreHours = process.env.VERCEL_ENV === 'preview'
    || (process.env.NODE_ENV !== 'production' && process.env.OUTHERE_IGNORE_HOURS === '1');
  const fitsFor = (i: (typeof tryFriends)[number]) =>
    hangPlaces(db.places.filter((p) => !excluded.has(p.id)), meAt, locOf(i.friend.id) ?? DEMO_CENTER, at, new Date(i.until), b.budgetMax ?? null, { ignoreHours });
  // The first free friend may have only a few minutes left (say Maya's window ends in 25 min): try the next one
  // instead of showing "nothing fits" while Kai is free for an hour.
  let item = tryFriends[0];
  let places = fitsFor(item);
  for (const i of tryFriends.slice(1)) {
    if (places.length > 0) break;
    const p = fitsFor(i);
    if (p.length > 0) { item = i; places = p; }
  }
  const picked = item;
  const others = free.items.filter((i) => i.friend.id !== picked.friend.id).slice(0, 3).map((i) => i.friend);
  if (places.length === 0) return { draft: null, friend: item.friend, others, reason: 'no_place_fits' };
  const friendAt = locOf(item.friend.id) ?? DEMO_CENTER;
  const until = new Date(item.until);
  const funnel = hangFunnel(db.places.filter((p) => !excluded.has(p.id)), meAt, friendAt, at, until, b.budgetMax ?? null, { ignoreHours });

  const ctx: HangContext = {
    text: b.text, now: at, until, budgetMax: b.budgetMax ?? null, places,
    me: { firstName: viewer.name.split(' ')[0] ?? viewer.name, interests: viewer.interests, location: meAt },
    friend: {
      id: item.friend.id, firstName: item.friend.name.split(' ')[0] ?? item.friend.name,
      // only interests the friend shares with the viewer reach the model
      interests: item.sharedInterests,
      note: item.text?.trim() || null, location: friendAt,
    },
  };
  const routeName = '/api/muse/draft-hang';
  try {
    const res = await museJSON({
      schemaName: 'draft_hang', schema: RawHangZ, jsonSchema: RAW_HANG_JSON_SCHEMA,
      messages: hangMessages(ctx), model: 'fast', effort: 'minimal',
      mock: () => mockHang(ctx), route: routeName, userId: viewer.id, deadline: Date.now() + 8_000,
    });
    const draft = validateHang(res.data, ctx);
    const work = draft ? hangWork(funnel, draft, ctx) : null;
    return NextResponse.json({ draft, work, friend: item.friend, others, mode: res.mock ? 'mock' : 'live' }, {
      headers: { 'x-muse-mode': res.mock ? 'mock' : 'live', 'x-muse-model': res.model },
    });
  } catch (err) {
    const msg = String((err as Error)?.message ?? err).slice(0, 200);
    reportFallback({ route: routeName, step: 'draft', error: msg, userId: viewer.id });
    const draft = validateHang(mockHang(ctx), ctx);
    const work = draft ? hangWork(funnel, draft, ctx) : null;
    return NextResponse.json({ draft, work, friend: item.friend, others, mode: 'fallback' }, { headers: { 'x-muse-mode': 'fallback' } });
  }
}, { refresh: LIVE_TABLES });
