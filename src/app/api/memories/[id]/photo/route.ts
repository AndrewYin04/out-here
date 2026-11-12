import { route } from '@/lib/api';
import { FRESH_HEADER } from '@/features/data/server';

const readPhoto = route<{ id: string }>(async ({ store, viewer, params }) => {
  const photo = await store.memoryPhoto(viewer.id, params.id);
  return new Response(photo, {
    headers: {
      'content-type': 'image/jpeg',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
});

export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const headers = new Headers(req.headers);
  headers.set(FRESH_HEADER, '1');
  // Copy by URL: `new Request(req, …)` throws on Node 24 when req is Next's request class.
  return readPhoto(new Request(req.url, { method: req.method, headers }), ctx);
}
