// useApi refetch coalescing (issue #36): a burst of realtime messages for one path makes one GET
// plus at most one trailing GET, and a trigger during a fetch always gets data fetched after it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coalescedFetch, Coalescer, markArrival, resetCoalescers } from '@/features/data/coalesce';

beforeEach(() => { vi.useFakeTimers(); resetCoalescers(); });
afterEach(() => { vi.useRealTimers(); });

/** A fetch that takes `ms` and returns how many fetches had started when it began. */
function slowFetcher(ms: number) {
  let n = 0;
  const fetcher = vi.fn(() => { const mine = ++n; return new Promise<number>((r) => setTimeout(() => r(mine), ms)); });
  return fetcher;
}

describe('Coalescer', () => {
  it('5 triggers within 100 ms make 1 fetch plus 1 trailing fetch', async () => {
    const fetcher = slowFetcher(80);
    const c = new Coalescer(fetcher, 250);
    const results: Promise<number>[] = [];
    for (let i = 0; i < 5; i++) {
      results.push(c.trigger());
      await vi.advanceTimersByTimeAsync(25);
    }
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const got = await Promise.all(results);
    // The first trigger gets the first fetch; every later one gets the trailing fetch.
    expect(got).toEqual([1, 2, 2, 2, 2]);
  });

  it('a lone trigger fetches at once, with no added delay', async () => {
    const fetcher = slowFetcher(10);
    const c = new Coalescer(fetcher, 250);
    const p = c.trigger();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10);
    await expect(p).resolves.toBe(1);
  });

  it('a trigger during a slow fetch waits for it and gets exactly one trailing fetch', async () => {
    const fetcher = slowFetcher(2000);
    const c = new Coalescer(fetcher, 250);
    const first = c.trigger();
    await vi.advanceTimersByTimeAsync(500);
    const late = [c.trigger(), c.trigger(), c.trigger()];
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1510); // first fetch ends at 2000 ms
    expect(fetcher).toHaveBeenCalledTimes(2); // the trailing one starts right after
    await vi.advanceTimersByTimeAsync(2000);
    expect(await first).toBe(1);
    expect(await Promise.all(late)).toEqual([2, 2, 2]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('triggers spaced wider than the window each fetch', async () => {
    const fetcher = slowFetcher(10);
    const c = new Coalescer(fetcher, 250);
    for (let i = 0; i < 3; i++) { void c.trigger(); await vi.advanceTimersByTimeAsync(300); }
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('a failed fetch does not block the trailing one', async () => {
    let calls = 0;
    const c = new Coalescer(() => (++calls === 1 ? Promise.reject(new Error('503')) : Promise.resolve('ok')), 250);
    const a = c.trigger();
    a.catch(() => undefined);
    const b = c.trigger();
    await vi.advanceTimersByTimeAsync(300);
    await expect(a).rejects.toThrow('503');
    await expect(b).resolves.toBe('ok');
  });
});

describe('Coalescer with message marks (E1)', () => {
  it('3 triggers in one tick for one message start 1 fetch', async () => {
    const fetcher = slowFetcher(50);
    const c = new Coalescer(fetcher, 250);
    const at = markArrival();
    const got = [c.trigger(at), c.trigger(at), c.trigger(at)];
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await Promise.all(got)).toEqual([1, 1, 1]);
  });

  it('a message that arrives after the fetch in flight started still gets a trailing fetch', async () => {
    const fetcher = slowFetcher(200);
    const c = new Coalescer(fetcher, 250);
    const first = c.trigger(markArrival());
    await vi.advanceTimersByTimeAsync(50);
    const late = c.trigger(markArrival());
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await first).toBe(1);
    expect(await late).toBe(2);
  });
});

describe('coalescedFetch', () => {
  it('hooks woken by one message share 1 GET per path (E1)', async () => {
    const a = slowFetcher(50);
    const at = markArrival();
    for (let i = 0; i < 3; i++) void coalescedFetch('maya|fresh|/api/locations/friends', a, { since: at });
    await vi.advanceTimersByTimeAsync(1000);
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('shares one fetch across hooks that ask for the same key, not across keys', async () => {
    const a = slowFetcher(50);
    const b = slowFetcher(50);
    // three hooks on /api/quests/mine as alex, one on another path
    void coalescedFetch('alex|fresh|/api/quests/mine', a);
    void coalescedFetch('alex|fresh|/api/quests/mine', a);
    void coalescedFetch('alex|fresh|/api/quests/mine', a);
    void coalescedFetch('alex|fresh|/api/notifications', b);
    await vi.advanceTimersByTimeAsync(1000);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
