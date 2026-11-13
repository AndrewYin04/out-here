import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEMO_CENTER, profileId, setNow } from '@/shared';
import { createMemoryStore } from '@/features/data/memory-store';

// 10:50 AM in Menlo Park: places are open. Muse runs offline (mock) so the test is deterministic.
const NOW = new Date('2026-11-12T18:50:00Z');
const alex = profileId('alex');
const maya = profileId('maya');
const store = vi.hoisted(() => ({ current: null as unknown }));
const viewerId = vi.hoisted(() => ({ current: '' }));

vi.mock('@/features/data/server', async (importOriginal) => {
  const data = await importOriginal<typeof import('@/features/data/server')>();
  type S = ReturnType<typeof createMemoryStore>;
  return {
    ...data,
    getStore: () => store.current,
    getViewer: async () => (await (store.current as S).museContext()).db.profiles.find((p) => p.id === viewerId.current),
  };
});

const { POST } = await import('@/app/api/muse/draft-hang/route');
const draft = (body: Record<string, unknown>) =>
  POST(new Request('http://localhost/api/muse/draft-hang', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({}) });

beforeAll(() => {
  vi.stubEnv('MUSE_MOCK', '1');
  setNow(NOW);
});
afterAll(() => { setNow(null); vi.unstubAllEnvs(); });

describe('POST /api/muse/draft-hang', () => {
  it('drafts a plan at a real open place when a friend is free, and Make this plan invites them', async () => {
    const s = createMemoryStore(NOW);
    store.current = s;
    viewerId.current = alex;
    const until = new Date(NOW.getTime() + 90 * 60_000).toISOString();
    await s.createAvailability(alex, { text: 'hungry', startsAt: NOW.toISOString(), endsAt: until, location: DEMO_CENTER });
    await s.createAvailability(maya, { text: 'craving dumplings', startsAt: NOW.toISOString(), endsAt: until, location: DEMO_CENTER });

    const res = await draft({ text: 'hungry', friendId: maya, budgetMax: 15 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('mock');
    expect(body.friend.id).toBe(maya);
    const d = body.draft;
    const { db } = await s.museContext();
    expect(db.places.map((p) => p.id)).toContain(d.placeId); // a real place
    expect(d.priceMax).toBeLessThanOrEqual(15);
    expect(Date.parse(d.endsAt)).toBeLessThanOrEqual(Date.parse(until));
    // the friend's location never leaves the server, only their walking minutes
    expect(body.friend).not.toHaveProperty('location');
    // Muse's work: real counts and distances, never a location
    const w = body.work;
    expect(w.checked).toBe(db.places.filter((p) => p.location).length);
    expect(w.checked).toBeGreaterThanOrEqual(w.walkable);
    expect(w.walkable).toBeGreaterThanOrEqual(w.inBudget);
    expect(w.inBudget).toBeGreaterThanOrEqual(w.timeFits);
    expect(w.timeFits).toBeGreaterThanOrEqual(w.open);
    expect(w.open).toBeGreaterThan(0);
    expect(w.togetherMin).toBeGreaterThanOrEqual(30);
    expect(w.until).toBe(until);
    expect(w.apartM).toBe(0); // both at DEMO_CENTER in this test
    expect(w.myM).toBeGreaterThan(0);
    expect(JSON.stringify(w)).not.toMatch(/"lat"|"lng"|location/);
    expect(Object.keys(d).sort()).toEqual(['category', 'description', 'emoji', 'endsAt', 'friendId', 'invite', 'location', 'myWalk',
      'pitch', 'placeId', 'priceMax', 'startsAt', 'theirWalk', 'title', 'venueName']);

    // "Make this plan": one private hangout, Alex in it, Maya invited with Muse's message
    const quest = await s.createQuest(alex, {
      title: d.title, emoji: d.emoji, category: d.category, description: d.description, venueName: d.venueName,
      location: d.location, placeId: d.placeId, startsAt: d.startsAt, endsAt: d.endsAt, capacity: 4,
      priceMax: d.priceMax, tags: [], groupId: null, visibility: 'friends', inviteIds: [maya], inviteMessage: d.invite,
    } as never);
    expect(quest.memberIds).toContain(alex);
    const { incoming } = await s.invites(maya);
    expect(incoming.some((i) => i.questId === quest.id && i.message === d.invite)).toBe(true);
  });

  it('drafts with the next free friend when the first one is nearly out of time', async () => {
    const s = createMemoryStore(NOW);
    store.current = s;
    viewerId.current = alex;
    const kai = profileId('kai');
    const soon = new Date(NOW.getTime() + 20 * 60_000).toISOString(); // too short for 30 min together
    const later = new Date(NOW.getTime() + 90 * 60_000).toISOString();
    await s.createAvailability(alex, { text: 'free', startsAt: NOW.toISOString(), endsAt: later, location: DEMO_CENTER });
    await s.createAvailability(maya, { text: 'free a bit', startsAt: NOW.toISOString(), endsAt: soon, location: DEMO_CENTER });
    await s.createAvailability(kai, { text: 'down for boba', startsAt: NOW.toISOString(), endsAt: later, location: DEMO_CENTER });
    const free = await s.freeWithMe(alex);
    expect(free.items[0]?.friend.id).toBe(maya); // Maya comes first, so the fallback to Kai is what is tested
    expect(free.items.map((i) => i.friend.id)).toContain(kai);

    const body = await (await draft({ text: 'free for a bit' })).json();
    expect(body.reason).toBeUndefined();
    expect(body.friend.id).toBe(kai);
    expect(body.draft.friendId).toBe(kai);
    expect(body.others.map((p: { id: string }) => p.id)).not.toContain(kai);
    // asking for Maya by name still says her window is too short
    const mayaOnly = await (await draft({ text: 'free for a bit', friendId: maya })).json();
    expect(mayaOnly).toMatchObject({ draft: null, reason: 'no_place_fits' });
  });

  it('says so when nobody is free with you', async () => {
    const s = createMemoryStore(NOW);
    store.current = s;
    viewerId.current = profileId('jordan');
    const body = await (await draft({ text: 'hungry' })).json();
    expect(body).toMatchObject({ draft: null, reason: 'no_friend_free' });
  });
});
