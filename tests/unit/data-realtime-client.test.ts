// The tab-wide realtime manager (realtime-client.ts), run in node with a stubbed window,
// EventSource and fetch. Finding R2: one EventSource per tab, not one per hook. Finding R1: in
// Supabase mode a channel shared by two hooks survives one of them unmounting.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class FakeEventSource {
  static all: FakeEventSource[] = [];
  readyState = 0;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor(public url: string) { FakeEventSource.all.push(this); }
  get channels() { return decodeURIComponent(new URL(this.url, 'http://x').searchParams.get('channels') ?? ''); }
  open() { this.readyState = 1; this.onopen?.(); }
  emit(channel: string, payload: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify({ channel, event: 'update', payload }) }); }
  close() { this.closed = true; this.readyState = 2; }
  static live() { return FakeEventSource.all.filter((e) => !e.closed); }
}

type RC = typeof import('@/features/data/realtime-client');
let rc: RC;

beforeAll(async () => {
  vi.stubGlobal('window', {
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
    location: { search: '?as=alex', href: 'http://x/?as=alex' },
    sessionStorage: { getItem: () => 'alex', setItem: () => {} },
    history: { replaceState: () => {}, state: null },
  });
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal('fetch', async (url: string) => {
    if (url === '/api/realtime/config') return new Response(JSON.stringify({ mode: 'sse' }));
    return new Response(JSON.stringify({ userIds: [] }));
  });
  rc = await import('@/features/data/realtime-client');
});

afterEach(() => { FakeEventSource.all = []; });

describe('realtime manager, SSE mode (R2)', () => {
  it('six hooks on overlapping channels plus presence share one EventSource', async () => {
    const offs = [
      rc.subscribeChannels(['quest:a', 'quest:b'], () => {}), // useQuests
      rc.subscribeChannels(['quest:a'], () => {}), // useQuest
      rc.subscribeChannels(['user:alex'], () => {}), // useFriendAvailability
      rc.subscribeChannels(['user:alex'], () => {}), // useInvites
      rc.subscribeChannels(['user:alex'], () => {}), // useNotifications
      rc.subscribePresence(() => {}), // useOnline
    ];
    await sleep(80);
    expect(FakeEventSource.live()).toHaveLength(1);
    expect(FakeEventSource.live()[0].channels).toBe('presence:online,quest:a,quest:b,user:alex');
    for (const off of offs) off();
    await sleep(80);
    expect(FakeEventSource.live()).toHaveLength(0);
  });

  it('a handler keeps receiving after another hook on the same channel unmounts', async () => {
    const got: string[] = [];
    const offMap = rc.subscribeChannels(['quest:q'], (c) => got.push(`map:${c}`));
    const offSheet = rc.subscribeChannels(['quest:q'], (c) => got.push(`sheet:${c}`));
    await sleep(80);
    const es = FakeEventSource.live()[0];
    es.open();
    offSheet();
    await sleep(80);
    FakeEventSource.live().at(-1)!.emit('quest:q', { seatsLeft: 1 });
    expect(got).toEqual(['map:quest:q']);
    offMap();
    await sleep(80);
  });

  it('a new channel swaps streams without losing messages on either', async () => {
    const got: string[] = [];
    const off1 = rc.subscribeChannels(['quest:a'], (c, p) => got.push(`${c}:${String(p.n)}`));
    await sleep(80);
    const first = FakeEventSource.live()[0];
    first.open();
    const off2 = rc.subscribeChannels(['user:alex'], (c, p) => got.push(`${c}:${String(p.n)}`));
    await sleep(80);
    const second = FakeEventSource.all.at(-1)!;
    expect(second).not.toBe(first);
    expect(second.channels).toBe('quest:a,user:alex');
    // before the new stream connects: old delivers quest:a, new delivers only user:alex
    first.emit('quest:a', { n: 1 });
    second.emit('quest:a', { n: 1 });
    second.emit('user:alex', { n: 2 });
    second.open();
    expect(first.closed).toBe(true);
    second.emit('quest:a', { n: 3 });
    expect(got).toEqual(['quest:a:1', 'user:alex:2', 'quest:a:3']);
    expect(FakeEventSource.live()).toHaveLength(1);
    off1(); off2();
    await sleep(80);
  });

  it('a reconnect after an error tells every handler to resync', async () => {
    const got: unknown[] = [];
    const off = rc.subscribeChannels(['quest:z'], (_c, p) => got.push(p));
    await sleep(80);
    const es = FakeEventSource.live()[0];
    es.open();
    es.open(); // EventSource reconnected by itself after a network error
    expect(got).toEqual([{ resync: true }]);
    off();
    await sleep(80);
  });
});
