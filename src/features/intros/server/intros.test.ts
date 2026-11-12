import { beforeAll, describe, expect, it } from 'vitest';
import { profileId, type Intro, type TrustPath } from '@/shared';
import { createMemoryStore, type DataStore } from '@/features/data/server';
import { candidatesFor, passesBar, reachOf, trustPathOf, underWeeklyCap, WEEK_MS } from './rules';
import { listIntros, requestIntro, resetIntros, respondIntro, runIntroRound } from './service';

const alex = profileId('alex');
const jordan = profileId('jordan');
const maya = profileId('maya');
const tess = profileId('tess');

beforeAll(() => { process.env.MUSE_MOCK = '1'; });

const path: TrustPath = { mutualIds: [maya], groupIds: [], label: 'You both know Maya' };

describe('quality bar', () => {
  const reasons = ['You both love local bands', 'Alex is looking for design chats; Jordan works as a designer'];
  it('passes at 85 with 2 reasons and a trust path', () => {
    expect(passesBar(85, reasons, path)).toEqual({ ok: true });
  });
  it('fails below 85', () => {
    expect(passesBar(84, reasons, path)).toEqual({ ok: false, why: 'score' });
  });
  it('fails with fewer than 2 concrete reasons', () => {
    expect(passesBar(95, [reasons[0]], path)).toEqual({ ok: false, why: 'reasons' });
    expect(passesBar(95, [reasons[0], 'ok'], path)).toEqual({ ok: false, why: 'reasons' });
  });
  it('fails without a trust path', () => {
    expect(passesBar(95, reasons, null)).toEqual({ ok: false, why: 'trust_path' });
    expect(passesBar(95, reasons, { mutualIds: [], groupIds: [], label: '' })).toEqual({ ok: false, why: 'trust_path' });
  });
});

describe('weekly cap', () => {
  const base: Omit<Intro, 'id' | 'source' | 'createdAt'> = {
    kind: 'friendship', aId: alex, bId: jordan, trustPath: path, score: 90, reasons: [], summary: '', noteA: '', noteB: '',
    firstStep: { text: '', questId: null, placeId: null }, agentLogA: [], agentLogB: [], status: 'proposed',
    declinedBy: null, threadId: null, decidedAt: null,
  };
  const t = Date.parse('2026-11-12T18:00:00Z');
  it('allows one automatic intro per person per week, either side', () => {
    const recent = [{ ...base, id: '1', source: 'auto' as const, createdAt: new Date(t - 2 * 86_400_000).toISOString() }];
    expect(underWeeklyCap(recent, alex, t)).toBe(false);
    expect(underWeeklyCap(recent, jordan, t)).toBe(false);
    expect(underWeeklyCap(recent, tess, t)).toBe(true);
  });
  it('ignores older and on-request intros', () => {
    const old = [{ ...base, id: '1', source: 'auto' as const, createdAt: new Date(t - WEEK_MS - 1000).toISOString() }];
    const req = [{ ...base, id: '2', source: 'request' as const, createdAt: new Date(t - 1000).toISOString() }];
    expect(underWeeklyCap(old, alex, t)).toBe(true);
    expect(underWeeklyCap(req, alex, t)).toBe(true);
  });
});

describe('seed graph and reach', () => {
  let store: DataStore;
  beforeAll(() => { store = createMemoryStore(); });

  it('jordan is not alex\'s friend, and they share Maya and Bay Area Local Shows', async () => {
    const { view } = await store.museContext();
    expect(view.areFriends(alex, jordan)).toBe(false);
    expect(view.friendship(alex, jordan)).toBeNull();
    const tp = trustPathOf(view, alex, jordan)!;
    expect(tp.mutualIds).toEqual([maya]);
    expect(tp.label).toBe('You both know Maya');
    expect(tp.groupIds.map((g) => view.groupById.get(g)?.slug)).toContain('bay-area-local-shows');
  });

  it('reach is friends-of-friends plus group members, never friends', async () => {
    const { view } = await store.museContext();
    const reach = reachOf(view, alex);
    expect(reach.has(jordan)).toBe(true);
    expect(reach.has(maya)).toBe(false);
    expect(reach.has(alex)).toBe(false);
  });

  it('only opted-in people of a shared kind are candidates; jordan ranks first', async () => {
    const { view } = await store.museContext();
    const cands = candidatesFor(view, alex, { kinds: ['friendship', 'networking'], nowMs: Date.now() });
    const handles = cands.map((c) => c.profile.handle);
    expect(handles[0]).toBe('jordan');
    expect(handles).toContain('tess');
    expect(handles).not.toContain('maya');   // already a friend
    expect(handles).not.toContain('riley');  // dating only
    expect(cands[0].facts.length).toBeGreaterThanOrEqual(4);
    expect(cands.find((c) => c.profile.handle === 'tess')!.facts).toHaveLength(0);
  });
});

describe('mock Click round and double opt-in', () => {
  let store: DataStore;
  beforeAll(() => { store = createMemoryStore(); });

  it('alex <-> jordan passes (~91) with a trust path; weak candidates stay hidden', async () => {
    const r = await runIntroRound(store, alex);
    expect(r.intro).not.toBeNull();
    const c = r.intro!;
    expect(c.other.handle).toBe('jordan');
    expect(c.score).toBe(91);
    expect(c.trustPath[0]).toBe('You both know Maya');
    expect(c.reasons.length).toBeGreaterThanOrEqual(2);
    expect(c.reasons.join(' ')).toMatch(/local (bands|shows)/);
    expect(c.reasons.join(' ')).toMatch(/design/);
    expect(c.myAgentLog.length).toBe(2);
    expect(r.belowBar).toBeGreaterThanOrEqual(1);
    const { intros } = await listIntros(store, alex);
    expect(intros.map((i) => i.other.handle)).toEqual(['jordan']);
  });

  it('weekly cap stops a second automatic round', async () => {
    const r = await runIntroRound(store, alex);
    expect(r.intro).toBeNull();
    expect(r.capped).toBe(true);
  });

  it('each side sees only its own agent log', async () => {
    const a = (await listIntros(store, alex)).intros[0];
    const j = (await listIntros(store, jordan)).intros[0];
    expect(j.other.handle).toBe('alex');
    expect(a.myAgentLog[0]).toMatch(/Alex's agent/);
    expect(j.myAgentLog[0]).toMatch(/Jordan's agent/);
    expect(a.myAgentLog.some((t) => t.includes("Jordan's agent here"))).toBe(false);
    expect((await listIntros(store, tess)).intros).toHaveLength(0);
  });

  it('nothing opens until both accept; then a thread with the Muse note exists', async () => {
    const id = (await listIntros(store, alex)).intros[0].id;
    const first = await respondIntro(store, alex, id, true);
    expect(first.intro.state).toBe('waiting');
    expect(first.intro.threadId).toBeNull();
    expect((await listIntros(store, jordan)).intros[0].state).toBe('new');
    const second = await respondIntro(store, jordan, id, true);
    expect(second.intro.state).toBe('connected');
    const threadId = second.intro.threadId!;
    const msgs = await store.messages(alex, threadId);
    expect(msgs.at(-1)!.text.startsWith('✨ Muse: ')).toBe(true);
    expect((await listIntros(store, alex)).intros[0].state).toBe('connected');
  });

  it('a dating request finds no great match', async () => {
    const r = await requestIntro(store, alex, 'dating', 'someone who loves live music');
    expect(r.intro).toBeNull();
    expect(r.message).toMatch(/^No great match yet/);
  });

  it('a decline is silent: the other side sees "didn\'t work out"', async () => {
    await resetIntros(store, alex);
    const r = await runIntroRound(store, alex);
    expect(r.intro?.other.handle).toBe('jordan');
    await respondIntro(store, jordan, r.intro!.id, false);
    const a = (await listIntros(store, alex)).intros[0];
    expect(a.state).toBe('closed');
    expect(a.closedText).toBe("Didn't work out this time");
  });
});
