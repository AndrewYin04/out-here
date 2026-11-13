// GET    /api/muse/wants                 -> { wants: MuseWant[] }   (the viewer's active wants)
// POST   /api/muse/wants  body { text }  -> { want: MuseWant }      (Muse parses it; header x-muse-mode)
// DELETE /api/muse/wants?id=<id>         -> { ok: true }
//        "Tell Muse what you're looking for": Muse turns the sentence into item, keywords, max
//        price and max drive. Code clamps the numbers; matching later is code only (finds.ts).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseWant } from '@/features/muse';
import { body, route } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const BodyZ = z.object({ text: z.string().trim().min(3).max(200) });

export const GET = route(async ({ store, viewer }) => ({ wants: await store.museWants(viewer.id) }));

export const POST = route(async ({ store, viewer, req }) => {
  const b = await body(req, BodyZ);
  const { want, source } = await parseWant(b.text, viewer.id);
  const saved = await store.addMuseWant(viewer.id, want);
  return NextResponse.json({ want: saved }, { headers: { 'x-muse-mode': source === 'muse' ? 'live' : source } });
});

export const DELETE = route(async ({ store, viewer, req }) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  return store.removeMuseWant(viewer.id, id);
});
