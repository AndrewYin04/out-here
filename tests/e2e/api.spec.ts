import { expect, test, type APIRequestContext } from '@playwright/test';
import { profileId, seedId } from '../../src/shared/seed/ids';

// API contract checks against the running server (MemoryStore in builders, Supabase dev in main).
// They share server state, so they run once (desktop project) and in order.
test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== 'desktop', 'API spec runs once, on the desktop project');
});

const alex = { 'x-persona': 'alex' };
const maya = { 'x-persona': 'maya' };
const dumplings = seedId('quest', 'dumplings');

async function seats(request: APIRequestContext, headers: Record<string, string>) {
  const res = await request.get(`/api/quests/${dumplings}`, { headers });
  expect(res.status()).toBe(200);
  return (await res.json()) as { seatsLeft: number; quest: { memberIds: string[]; location: { lat: number } }; viewerIsMember: boolean };
}

test('persona header is required and must be a known handle', async ({ request }) => {
  const missing = await request.get('/api/feed');
  expect(missing.status()).toBe(400);
  expect(await missing.json()).toHaveProperty('error');
  const unknown = await request.get('/api/feed', { headers: { 'x-persona': 'nobody-here' } });
  expect(unknown.status()).toBe(400);
  const viaQuery = await request.get('/api/feed?as=maya');
  expect(viaQuery.status()).toBe(200);
});

test('feed as alex and maya differ and carry post view models', async ({ request }) => {
  const a = await (await request.get('/api/feed', { headers: alex })).json();
  const m = await (await request.get('/api/feed', { headers: maya })).json();
  expect(a.posts.length).toBeGreaterThan(0);
  expect(m.posts.length).toBeGreaterThan(0);
  const p = a.posts[0];
  expect(p).toHaveProperty('author.name');
  expect(Object.keys(p.reactionCounts).sort()).toEqual(['angry', 'care', 'haha', 'like', 'love', 'sad', 'wow']);
  expect(a.posts.map((x: { id: string }) => x.id)).not.toEqual(m.posts.map((x: { id: string }) => x.id));
});

test('friends: alex and maya are friends, with symmetric mutual friends', async ({ request }) => {
  const res = await request.get('/api/friends', { headers: alex });
  expect(res.status()).toBe(200);
  const { friends } = await res.json();
  expect(friends.map((f: { handle: string }) => f.handle)).toContain('maya');
  const ab = (await (await request.get('/api/friends/mutual/maya', { headers: alex })).json()).friends.map((f: { id: string }) => f.id).sort();
  const ba = (await (await request.get('/api/friends/mutual/alex', { headers: maya })).json()).friends.map((f: { id: string }) => f.id).sort();
  expect(ab).toEqual(ba);
});

test('bad input is a JSON 4xx', async ({ request }) => {
  const res = await request.post('/api/posts/whatever/reactions', { headers: alex, data: { type: 'yay' } });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toBeTruthy();
});

test('quest join and leave change seats for every viewer', async ({ request }) => {
  const before = await seats(request, alex);
  expect(before.viewerIsMember).toBe(false);

  const join = await request.post(`/api/quests/${dumplings}/join`, { headers: maya, data: {} });
  expect(join.status()).toBe(200);
  const joined = await join.json();
  expect(joined.seatsLeft).toBe(before.seatsLeft - 1);
  expect(joined.quest.memberIds).toContain(profileId('maya'));

  const seenByAlex = await seats(request, alex);
  expect(seenByAlex.seatsLeft).toBe(before.seatsLeft - 1);
  // exact location only for members
  expect(seenByAlex.quest.location).not.toEqual(joined.quest.location);

  const again = await request.post(`/api/quests/${dumplings}/join`, { headers: maya, data: {} });
  expect((await again.json()).seatsLeft).toBe(before.seatsLeft - 1);

  const leave = await request.post(`/api/quests/${dumplings}/leave`, { headers: maya, data: {} });
  expect(leave.status()).toBe(200);
  expect((await leave.json()).seatsLeft).toBe(before.seatsLeft);
  expect((await seats(request, alex)).seatsLeft).toBe(before.seatsLeft);
});

test('SSE realtime: alex receives quest:<id> after maya joins', async ({ request, baseURL }) => {
  const ctrl = new AbortController();
  const res = await fetch(`${baseURL}/api/realtime?channels=quest:${dumplings}&as=alex`, { signal: ctrl.signal });
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  // wait for the connect comment so the subscription is live before the join
  while (!buf.includes(': connected')) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
  }
  const join = await request.post(`/api/quests/${dumplings}/join`, { headers: maya, data: {} });
  expect(join.status()).toBe(200);
  const { seatsLeft } = await join.json();

  const deadline = Date.now() + 5000;
  let message: { channel: string; payload: { seatsLeft: number; memberCount: number } } | null = null;
  while (!message && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const line = buf.split('\n').find((l) => l.startsWith('data: '));
    if (line) message = JSON.parse(line.slice(6));
  }
  ctrl.abort();
  expect(message?.channel).toBe(`quest:${dumplings}`);
  expect(message?.payload.seatsLeft).toBe(seatsLeft);
  expect(typeof message?.payload.memberCount).toBe('number');

  await request.post(`/api/quests/${dumplings}/leave`, { headers: maya, data: {} });
});

test('invite from alex to maya: accept auto-joins, last seats run out with 409', async ({ request }) => {
  const before = await seats(request, alex);
  const inv = await request.post('/api/invites', {
    headers: alex,
    data: { toId: profileId('maya'), questId: dumplings, suggestionTitle: 'Dumplings before the rush', message: 'Come with me?' },
  });
  expect(inv.status()).toBe(200);
  const { invite } = await inv.json();
  const accept = await request.post(`/api/invites/${invite.id}/respond`, { headers: maya, data: { status: 'accepted' } });
  expect(accept.status()).toBe(200);
  const accepted = await accept.json();
  expect(accepted.invite.status).toBe('accepted');
  expect(accepted.quest.memberIds).toEqual(expect.arrayContaining([profileId('alex'), profileId('maya')]));
  const after = await seats(request, alex);
  expect(after.seatsLeft).toBe(Math.max(before.seatsLeft - 2, 0));
  if (after.seatsLeft === 0) {
    const full = await request.post(`/api/quests/${dumplings}/join`, { headers: { 'x-persona': 'jordan' }, data: {} });
    expect(full.status()).toBe(409);
    expect((await full.json()).error).toBe('quest_full');
  }
  await request.post(`/api/quests/${dumplings}/leave`, { headers: maya, data: {} });
  await request.post(`/api/quests/${dumplings}/leave`, { headers: alex, data: {} });
});

test('invite to the last seat: maya takes it alone, alex is told', async ({ request }) => {
  const volleyball = seedId('quest', 'volleyball');
  const q0 = await (await request.get(`/api/quests/${volleyball}`, { headers: alex })).json();
  test.skip(q0.seatsLeft !== 1 || q0.viewerIsMember, 'needs the seeded volleyball quest with 1 seat left');
  const inv = await request.post('/api/invites', {
    headers: alex,
    data: { toId: profileId('maya'), questId: volleyball, suggestionTitle: 'Last volleyball spot', message: 'Want it?' },
  });
  expect(inv.status()).toBe(200);
  const { invite } = await inv.json();
  expect(invite.seatsLeft).toBe(1);
  const [a, b] = await Promise.all([1, 2].map(() =>
    request.post(`/api/invites/${invite.id}/respond`, { headers: maya, data: { status: 'accepted' } })));
  for (const r of [a, b]) {
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.invite.status).toBe('accepted');
    expect(body.joinedAlone).toBe(true);
  }
  const after = await (await request.get(`/api/quests/${volleyball}`, { headers: maya })).json();
  expect(after.seatsLeft).toBe(0);
  expect(after.viewerIsMember).toBe(true);
  const out = await (await request.get('/api/invites', { headers: alex })).json();
  expect(out.outgoing.find((i: { id: string }) => i.id === invite.id)?.status).toBe('accepted');
  await request.post(`/api/quests/${volleyball}/leave`, { headers: maya, data: {} });
});

test('notifications, threads, groups, events and search respond for a persona', async ({ request }) => {
  for (const path of ['/api/notifications', '/api/threads', '/api/groups', '/api/events', '/api/search?q=dump', '/api/stories', '/api/profile/maya', '/api/friends/requests', '/api/friends/suggestions', '/api/friend-lists', '/api/crews', '/api/users', '/api/groups/cheap-eats-south-bay/hangouts']) {
    const res = await request.get(path, { headers: alex });
    expect(res.status(), path).toBe(200);
  }
  const hangouts = await (await request.get('/api/groups/cheap-eats-south-bay/hangouts', { headers: alex })).json();
  expect(hangouts.quests.map((q: { id: string }) => q.id)).toContain(dumplings);
});

test('every route reports Server-Timing (total, table loads, queries, broadcasts)', async ({ request }) => {
  const get = await request.get('/api/quests?lat=37.4847&lng=-122.1477', { headers: { ...alex, 'x-outhere-fresh': '1' } });
  expect(get.status()).toBe(200);
  expect(get.headers()['server-timing']).toMatch(/^total;dur=[\d.]+, loads;desc="\d+", queries;desc="\d+", broadcasts;desc="\d+"$/);
  const bad = await request.post(`/api/quests/${dumplings}/join`, { headers: { 'x-persona': 'nobody-here' }, data: {} });
  expect(bad.status()).toBe(400);
  expect(bad.headers()['server-timing']).toContain('total;dur=');
});
