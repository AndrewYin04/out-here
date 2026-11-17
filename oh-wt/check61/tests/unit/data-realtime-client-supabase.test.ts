// Supabase mode of the tab-wide realtime manager (finding R1), against a fake supabase-js that
// behaves like realtime-js 2.119: channel(topic) returns the open channel for a topic that is
// already open, removeChannel tears that shared channel down, and presence callbacks added
// after subscribe() throw.
import { beforeAll, describe, expect, it, vi } from 'vitest';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Cb = (msg: { payload?: Record<string, unknown> }) => void;
class FakeChannel {
  broadcast: Cb[] = [];
  presenceSync: (() => void)[] = [];
  subscribed = false;
  removed = false;
  tracked: unknown[] = [];
  constructor(public topic: string, public client: FakeClient) {}
  on(type: string, _filter: unknown, cb: Cb | (() => void)) {
    if (type === 'presence') {
      if (this.subscribed) throw new Error('cannot add presence callbacks after subscribe()');
      this.presenceSync.push(cb as () => void);
    } else this.broadcast.push(cb as Cb);
    return this;
  }
  subscribe(cb?: (s: string) => void) {
    this.subscribed = true;
    setTimeout(() => cb?.('SUBSCRIBED'), 1);
    return this;
  }
  async track(p: unknown) { this.tracked.push(p); for (const s of this.presenceSync) s(); }
  presenceState() { return { k: this.tracked }; }
  send(payload: Record<string, unknown>) { if (!this.removed) for (const b of this.broadcast) b({ payload }); }
}
class FakeClient {
  channels: FakeChannel[] = [];
  created: string[] = [];
  channel(topic: string) {
    const open = this.channels.find((c) => c.topic === topic);
    if (open) return open;
    const ch = new FakeChannel(topic, this);
    this.created.push(topic);
    this.channels.push(ch);
    return ch;
  }
  async removeChannel(ch: FakeChannel) {
    ch.removed = true;
    await sleep(5);
    this.channels = this.channels.filter((c) => c !== ch);
    return 'ok';
  }
}
const fake = new FakeClient();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake }));

type RC = typeof import('@/features/data/realtime-client');
let rc: RC;

beforeAll(async () => {
  vi.stubGlobal('window', {
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
    location: { search: '?as=alex', href: 'http://x/?as=alex' },
    sessionStorage: { getItem: () => 'alex', setItem: () => {} },
    history: { replaceState: () => {}, state: null },
  });
  vi.stubGlobal('EventSource', class { constructor() { throw new Error('no SSE in Supabase mode'); } });
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ mode: 'supabase', url: 'https://x.supabase.test', key: 'publishable' })));
  rc = await import('@/features/data/realtime-client');
});

const live = (topic: string) => fake.channels.find((c) => c.topic === topic && !c.removed);

describe('realtime manager, Supabase mode (R1)', () => {
  it('the map pin keeps updating after the quest sheet on the same channel closes', async () => {
    const got: string[] = [];
    const offMap = rc.subscribeChannels(['quest:q'], (_c, p) => got.push(`map:${String(p.seatsLeft)}`));
    const offSheet = rc.subscribeChannels(['quest:q'], (_c, p) => got.push(`sheet:${String(p.seatsLeft)}`));
    await sleep(60);
    expect(fake.created.filter((t) => t === 'quest:q')).toHaveLength(1);
    live('quest:q')!.send({ seatsLeft: 2 });
    offSheet();
    await sleep(1700); // past the removal grace period
    live('quest:q')!.send({ seatsLeft: 1 });
    expect(got).toEqual(['map:2', 'sheet:2', 'map:1']);
    offMap();
    await sleep(1700);
    expect(live('quest:q')).toBeUndefined();
  });

  it('a quick unmount and remount reuses the channel; after removal a new one is created', async () => {
    const off1 = rc.subscribeChannels(['user:u'], () => {});
    await sleep(60);
    off1();
    await sleep(60);
    const got: unknown[] = [];
    const off2 = rc.subscribeChannels(['user:u'], (_c, p) => got.push(p));
    await sleep(60);
    expect(fake.created.filter((t) => t === 'user:u')).toHaveLength(1);
    live('user:u')!.send({ type: 'invite', id: 'i1' });
    expect(got).toEqual([{ type: 'invite', id: 'i1' }]);
    off2();
    await sleep(1700);
    expect(live('user:u')).toBeUndefined();
    const off3 = rc.subscribeChannels(['user:u'], () => {});
    await sleep(60);
    expect(fake.created.filter((t) => t === 'user:u')).toHaveLength(2);
    expect(live('user:u')).toBeDefined();
    off3();
  });

  it('two useOnline share one presence channel and both see the online set', async () => {
    const a: string[][] = [];
    const b: string[][] = [];
    const offA = rc.subscribePresence((ids) => a.push(ids));
    const offB = rc.subscribePresence((ids) => b.push(ids));
    await sleep(60);
    expect(fake.created.filter((t) => t === 'presence:online')).toHaveLength(1);
    expect(a.at(-1)).toHaveLength(1);
    expect(b.at(-1)).toEqual(a.at(-1));
    offA(); offB();
  });
});
