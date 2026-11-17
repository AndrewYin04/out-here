import { timingSafeEqual } from 'node:crypto';
import { buildMemoryDb, forbidden } from '@/features/data/server';
import { route } from '@/lib/api';
import { now } from '@/shared';

export const POST = route(async ({ store, req }) => {
  const key = process.env.DEMO_RESET_TOKEN;
  const provided = req.headers.get('x-demo-key');
  if (!key?.trim() || !provided) throw forbidden('A valid demo reset key is required.');
  const expected = Buffer.from(key);
  const actual = Buffer.from(provided);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw forbidden('A valid demo reset key is required.');
  }
  return { ok: true, ...(await store.resetStory(buildMemoryDb(now()))) };
});
