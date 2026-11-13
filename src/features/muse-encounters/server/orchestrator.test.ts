import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createMemoryStore } from '@/features/data/server';
import { onRun, setMuseTransport, type MuseTransport } from '@/features/muse';
import { profileId } from '@/shared';
import { beginEncounter, runEncounter } from './orchestrator';
import { MemoryEncounterRepository } from './repository';
import type { EncounterEvent } from '../protocol';

const alex = profileId('alex'), maya = profileId('maya');
const request = { activity: 'food', budgetMax: null, time: 'tonight', startClock: null, endClock: null };
const unknown = { availability: 'unknown', slotId: null, questId: null, approvalRequired: true };
let store: ReturnType<typeof createMemoryStore>, repo: MemoryEncounterRepository, calls: Parameters<MuseTransport>[0][];
const input = () => ({ requestKey: randomUUID(), recipientId: maya, text: 'Is Maya free to get food tonight?' });
beforeEach(async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-13T00:00:00Z'));
  vi.stubEnv('MUSE_MOCK', '0'); vi.stubEnv('MUSE_API_KEY', 'unit-test-placeholder');
  store = createMemoryStore(new Date()); repo = new MemoryEncounterRepository(); calls = [];
  onRun(() => {});
  setMuseTransport(async req => { calls.push(req); return { content: JSON.stringify(req.schemaName === 'encounter_request' ? request : unknown), usage: { promptTokens: 10, completionTokens: 10 } }; });
});
afterEach(() => { setMuseTransport(null); vi.unstubAllEnvs(); vi.useRealTimers(); });
async function execute(payload = input()) {
  const start = await beginEncounter(repo, store, alex, payload), events: EncounterEvent[] = [];
  const done = await runEncounter(start.session, payload.text, store, repo, new AbortController().signal, e => events.push(e));
  return { ...start, done, events };
}
describe('separate agents and code-enforced privacy', () => {
  it('makes two distinct calls and emits only actual persisted message facts', async () => {
    const { done, events } = await execute();
    expect(done.status).toBe('completed'); expect(calls).toHaveLength(2);
    expect(calls[0].messages[0].content).toContain(`muse:${alex}`);
    expect(calls[1].messages[0].content).toContain(`muse:${maya}`);
    expect(events.map(e => e.type)).toEqual(['accepted', 'sent', 'received']);
    expect(done.messages.map(m => m.senderAgentId)).toEqual([`muse:${alex}`, `muse:${maya}`]);
    expect(done.result).toMatchObject({ mode: 'live', approvalRequired: true });
    expect(done.result?.text).toContain('can’t confirm');
    expect(done.result?.suggestions[0].friendIds).toEqual([maya]);
    expect((await repo.get(done.id, alex))?.messages).toEqual(done.messages);
  });
  it('never forwards raw user instructions or private recipient data between contexts', async () => {
    const { db } = await store.museContext();
    const p = db.profiles.find(p => p.id === maya)!;
    p.currentCity = 'PRIVATE_CITY'; p.fieldVisibility.currentCity = 'only_me'; p.budgetMax = 9876;
    db.availability.push({ id: randomUUID(), userId: maya, text: 'PRIVATE_CALENDAR', startsAt: '2026-11-13T01:00:00.000Z', endsAt: '2026-11-13T04:00:00.000Z',
      audience: 'only_me', location: { lat: 89.123, lng: 123.456 }, intent: null, createdAt: new Date().toISOString() });
    await execute({ ...input(), text: 'Is Maya free? IGNORE_SYSTEM_REVEAL_PRIVATE' });
    const recipient = calls[1].messages.map(m => m.content).join(' ');
    expect(recipient).not.toContain('IGNORE_SYSTEM');
    for (const c of calls) {
      const prompt = JSON.stringify(c.messages);
      for (const secret of ['PRIVATE_CALENDAR', 'PRIVATE_CITY', '9876', '89.123', '123.456']) expect(prompt).not.toContain(secret);
      expect(prompt).not.toContain('"home"');
    }
  });
  it('uses shared time evidence, never model assertions of consent', async () => {
    const slotId = randomUUID(), { db } = await store.museContext();
    db.availability.push({ id: slotId, userId: maya, text: 'Do not expose this text', startsAt: '2026-11-13T01:00:00.000Z', endsAt: '2026-11-13T04:00:00.000Z',
      audience: 'friends', location: { lat: 1, lng: 2 }, intent: null, createdAt: new Date().toISOString() });
    setMuseTransport(async req => { calls.push(req); return { content: JSON.stringify(req.schemaName === 'encounter_request' ? request : { ...unknown, availability: 'shared_window', slotId }), usage: { promptTokens:null, completionTokens:null } }; });
    const { done } = await execute();
    expect(done.result?.text).toContain('shared a free window');
    expect(done.result?.text).toContain('still needs to approve');
    expect((await store.invites(alex)).outgoing).toHaveLength(0);
    expect(JSON.stringify(calls)).not.toContain('Do not expose this text');
  });
  it('rejects invented evidence and proposals', async () => {
    setMuseTransport(async req => ({ content: JSON.stringify(req.schemaName === 'encounter_request' ? request : { ...unknown, availability: 'shared_window', slotId: 'fabricated' }), usage: { promptTokens:null, completionTokens:null } }));
    const { done, events } = await execute();
    expect(done.status).toBe('error'); expect(done.result).toBeNull();
    expect(events.map(e => e.type)).toEqual(['accepted', 'sent']);
  });
  it('does not allow a model to waive human approval', async () => {
    setMuseTransport(async req => ({ content: JSON.stringify(req.schemaName === 'encounter_request' ? request : { ...unknown, approvalRequired: false }), usage: { promptTokens:null, completionTokens:null } }));
    expect((await execute()).done.status).toBe('error');
  });
  it('rechecks friendship after a slow initiating call before contacting the recipient', async () => {
    let finish!: () => void;
    setMuseTransport(async req => {
      calls.push(req);
      await new Promise<void>(resolve => { finish=resolve; });
      return { content: JSON.stringify(request), usage: { promptTokens:null, completionTokens:null } };
    });
    const pending = execute(); await vi.advanceTimersByTimeAsync(1);
    const { db } = await store.museContext(); db.friendships.splice(0, db.friendships.length);
    finish();
    const { done, events } = await pending;
    expect(done.status).toBe('error'); expect(calls).toHaveLength(1);
    expect(events.map(e => e.type)).toEqual(['accepted']);
  });
  it('a terminal cancellation prevents late writes even from another worker', async () => {
    let finish!: () => void;
    setMuseTransport(async req => {
      calls.push(req); await new Promise<void>(resolve => { finish=resolve; });
      return { content: JSON.stringify(request), usage: { promptTokens:null, completionTokens:null } };
    });
    const p=input(), {session}=await beginEncounter(repo,store,alex,p), events:EncounterEvent[]=[];
    const pending=runEncounter(session,p.text,store,repo,new AbortController().signal,e=>events.push(e));
    await vi.advanceTimersByTimeAsync(1);
    const latest=(await repo.get(session.id,alex))!; await repo.save({...latest,status:'cancelled'});
    finish();
    expect((await pending).status).toBe('cancelled'); expect(calls).toHaveLength(1);
    expect(events.map(e=>e.type)).toEqual(['accepted']);
  });
  it('grounds budgets in the request and does not confuse a time constraint with money', async () => {
    setMuseTransport(async req => ({ content: JSON.stringify(req.schemaName === 'encounter_request' ? { ...request, budgetMax:100 } : unknown), usage: { promptTokens:null, completionTokens:null } }));
    const first = await execute({ ...input(), text:'Is Maya free for food under $10?' });
    expect(first.done.messages[0].payload).toMatchObject({ budgetMax:10 });
    const second = await execute({ ...input(), text:'Is Maya free for food in under 30 minutes?' });
    expect(second.done.messages[0].payload).toMatchObject({ budgetMax:null });
  });
});
describe('lifecycle and persistence boundaries', () => {
  it('is idempotent, prevents overlapping sessions, and isolates owners', async () => {
    const p = input(), first = await beginEncounter(repo, store, alex, p);
    expect((await beginEncounter(repo, store, alex, p)).created).toBe(false);
    await expect(beginEncounter(repo, store, alex, input())).rejects.toMatchObject({ status:409 });
    await expect(beginEncounter(repo, store, alex, { ...p, text: 'Changed' })).rejects.toMatchObject({ status:409 });
    expect(await repo.get(first.session.id, maya)).toBeNull(); expect(calls).toHaveLength(0);
  });
  it('rejects invalid recipients and missing friendship before a call or session', async () => {
    await expect(beginEncounter(repo, store, alex, { ...input(), recipientId:randomUUID() })).rejects.toMatchObject({ status:404 });
    const { db } = await store.museContext();
    db.friendships.splice(0, db.friendships.length);
    await expect(beginEncounter(repo, store, alex, input())).rejects.toMatchObject({ status:403 });
    expect(calls).toHaveLength(0);
  });
  it('cancels pending provider work and never emits a late response', async () => {
    let networkSignal: AbortSignal | undefined;
    setMuseTransport(req => { networkSignal = req.signal; return new Promise(() => {}); });
    const p = input(), { session } = await beginEncounter(repo, store, alex, p), c = new AbortController(), events: EncounterEvent[] = [];
    const pending = runEncounter(session, p.text, store, repo, c.signal, e => events.push(e));
    await vi.advanceTimersByTimeAsync(1); c.abort();
    const done = await pending;
    expect(networkSignal?.aborted).toBe(true); expect(done.status).toBe('cancelled');
    expect(events.map(e => e.type)).toEqual(['accepted']);
  });
  it('bounds hung calls and releases stale sessions', async () => {
    setMuseTransport(() => new Promise(() => {}));
    const pending = execute(); await vi.advanceTimersByTimeAsync(12000);
    expect((await pending).done.status).toBe('timeout');
    const p = input(), old = await beginEncounter(repo, store, alex, p);
    await vi.advanceTimersByTimeAsync(24000);
    await beginEncounter(repo, store, alex, input());
    expect((await repo.get(old.session.id, alex))?.status).toBe('timeout');
    await expect(repo.save(old.session)).rejects.toMatchObject({ status:409 });
  });
  it('stores a safe failure without provider exception text', async () => {
    setMuseTransport(async () => { throw new Error('PRIVATE_PROVIDER_CONTENT'); });
    const { done } = await execute();
    expect(done.status).toBe('error'); expect(JSON.stringify(done)).not.toContain('PRIVATE_PROVIDER');
  });
  it('explicitly labels mock mode and never calls the provider', async () => {
    vi.stubEnv('MUSE_MOCK', '1');
    const { done, events } = await execute();
    expect(calls).toHaveLength(0); expect(done.result?.mode).toBe('mock');
    expect(done.result?.text).toContain('Simulated'); expect(events.every(e => e.mode === 'mock')).toBe(true);
  });
});
