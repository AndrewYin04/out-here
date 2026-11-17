import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/demo/reset/route';

const resetStory = vi.hoisted(() => vi.fn(async () => ({ quests: 1, members: 1 })));
vi.mock('@/features/data/server', async (importOriginal) => {
  const data = await importOriginal<typeof import('@/features/data/server')>();
  return { ...data, getStore: () => ({ resetStory }), getViewer: async () => ({ id: 'alex' }) };
});

function reset(key?: string) {
  const headers = new Headers();
  if (key !== undefined) headers.set('x-demo-key', key);
  return POST(new Request('http://localhost/api/demo/reset', { method: 'POST', headers }), { params: Promise.resolve({}) });
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetStory.mockClear();
});

describe('shared demo reset authorization', () => {
  it.each([
    [undefined, undefined],
    [undefined, 'some-key'],
    ['   ', 'some-key'],
    ['presenter-key', undefined],
    ['presenter-key', 'incorrect-key'],
  ])('rejects a reset when the server key is %s and the header is %s', async (configured, provided) => {
    vi.stubEnv('DEMO_RESET_TOKEN', configured);
    expect((await reset(provided)).status).toBe(403);
    expect(resetStory).not.toHaveBeenCalled();
  });

  it('resets when the presenter supplies the configured key', async () => {
    vi.stubEnv('DEMO_RESET_TOKEN', 'presenter-key');
    const response = await reset('presenter-key');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, quests: 1, members: 1 });
    expect(resetStory).toHaveBeenCalledOnce();
  });
});
