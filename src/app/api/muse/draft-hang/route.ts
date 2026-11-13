// POST /api/muse/draft-hang  body: { text, friendId?, budgetMax?, excludePlaceIds?, now? }
//   -> { draft: HangDraft | null, friend: PersonCard | null, reason?: string, mode?: 'live'|'mock'|'fallback' }
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
  hangMessages, hangPlaces, mockHang, museJSON, RAW_HANG_JSON_SCHEMA, RawHangZ, reportFallback, validateHang,
  type HangContext,
} from '@/features/muse';
import { body, IdZ, route } from '@/lib/api';

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
  const item = b.friendId ? free.items.find((i) => i.friend.id === b.friendId) : free.items[0];
  if (!item) return { draft: null, friend: null, reason: 'no_friend_free' };

  const { db } = await store.museContext();
  const t = at.toISOString();
  const locOf = (userId: string): LatLng | null =>
    db.availability.filter((a) => a.userId === userId && a.endsAt > t).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0]?.location
    ?? db.locationShares?.find((s) => s.userId === userId)?.location
    ?? null;
  const meAt = locOf(viewer.id) ?? DEMO_CENTER;
  const friendAt = locOf(item.friend.id) ?? DEMO_CENTER;
  const until = new Date(item.until);
  const excluded = new Set(b.excludePlaceIds);
  const places = hangPlaces(db.places.filter((p) => !excluded.has(p.id)), meAt, friendAt, at, until, b.budgetMax ?? null);
  if (places.length === 0) return { draft: null, friend: item.friend, reason: 'no_place_fits' };

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
    return NextResponse.json({ draft: validateHang(res.data, ctx), friend: item.friend, mode: res.mock ? 'mock' : 'live' }, {
      headers: { 'x-muse-mode': res.mock ? 'mock' : 'live', 'x-muse-model': res.model },
    });
  } catch (err) {
    const msg = String((err as Error)?.message ?? err).slice(0, 200);
    reportFallback({ route: routeName, step: 'draft', error: msg, userId: viewer.id });
    return NextResponse.json({ draft: validateHang(mockHang(ctx), ctx), friend: item.friend, mode: 'fallback' }, { headers: { 'x-muse-mode': 'fallback' } });
  }
});
