import { z } from 'zod';
import { query, route } from '@/lib/api';
import { FRESH_HEADER } from '@/features/data/server';

const SAFE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const readPhoto = route(async ({ store, viewer, url }) => {
  const q = query(url, z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), userId: z.string().min(1).max(64) }));
  const photo = await store.sideQuestPhoto(viewer.id, q.date, q.userId);
  return new Response(photo, {
    headers: {
      'content-type': SAFE_TYPES.has(photo.type) ? photo.type : 'application/octet-stream',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
});

// GET /api/daily/photo?date&userId -> image bytes. The owner always; anyone else only while the
// owner shares the photo with the community. A private photo answers 404, never 403.
export function GET(req: Request, ctx: { params: Promise<Record<string, string>> }) {
  const headers = new Headers(req.headers);
  headers.set(FRESH_HEADER, '1');
  return readPhoto(new Request(req.url, { method: req.method, headers }), ctx);
}
