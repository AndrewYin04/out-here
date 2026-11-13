// A database deadline (supabase-store.ts QUERY_TIMEOUT_MS) reaches the browser as JSON 503.
import { describe, expect, it, vi } from 'vitest';
import { route } from '@/lib/api';
import { HttpError } from '@/features/data/errors';
import { SLOW_MESSAGE } from '@/features/data/supabase-store';

vi.mock('@/features/data/server', async (importOriginal) => {
  const data = await importOriginal<typeof import('@/features/data/server')>();
  return { ...data, getStore: () => ({}), getViewer: async () => ({ id: 'alex' }) };
});

describe('route wrapper', () => {
  it('answers a timed-out load with JSON 503 "Data is slow, try again"', async () => {
    const GET = route(async () => { throw new HttpError(503, SLOW_MESSAGE); });
    const res = await GET(new Request('http://localhost/api/quests'), { params: Promise.resolve({}) });
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'Data is slow, try again' });
  });
});
