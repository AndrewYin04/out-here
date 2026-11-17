import { expect, test } from '@playwright/test';

const as = (h: string) => ({ 'x-persona': h });

test('verify: two fast Accept POSTs from Alex give Jordan one intro notification', async ({ request }, info) => {
  test.skip(info.project.name !== 'desktop', 'once');
  for (const h of ['alex', 'jordan']) await request.post('/api/intros/reset', { headers: as(h) });
  const run = await (await request.post('/api/intros/run', { headers: as('alex'), data: {} })).json() as { intro: { id: string } };
  const id = run.intro.id;
  const [r1, r2] = await Promise.all([
    request.post('/api/intros/' + id + '/respond', { headers: as('alex'), data: { accept: true } }),
    request.post('/api/intros/' + id + '/respond', { headers: as('alex'), data: { accept: true } }),
  ]);
  expect(r1.ok() && r2.ok()).toBe(true);
  const notes = await (await request.get('/api/notifications', { headers: as('jordan') })).json() as { notifications: { type: string }[] };
  const n = notes.notifications.filter((x) => x.type === 'intro').length;
  console.log('JORDAN_INTRO_NOTIFICATIONS=' + n);
  const [j1, j2] = await Promise.all([
    request.post('/api/intros/' + id + '/respond', { headers: as('jordan'), data: { accept: true } }),
    request.post('/api/intros/' + id + '/respond', { headers: as('jordan'), data: { accept: true } }),
  ]);
  expect(j1.ok() && j2.ok()).toBe(true);
  const a = await (await request.get('/api/intros', { headers: as('alex') })).json() as { intros: { id: string; threadId?: string | null; chatHref?: string | null }[] };
  console.log('ALEX_INTRO=' + JSON.stringify(a.intros.find((x) => x.id === id)).slice(0, 300));
  const threads = await (await request.get('/api/threads', { headers: as('alex') })).json() as { threads: { id: string; members: { handle?: string; name: string }[] }[] } | { id: string; members: { name: string }[] }[];
  const list = Array.isArray(threads) ? threads : threads.threads;
  const jt = list.filter((t) => t.members.length === 2 && t.members.some((m) => m.name.startsWith('Jordan')));
  console.log('ALEX_JORDAN_THREADS=' + jt.length);
  const msgs = await (await request.get('/api/threads/' + jt[0].id + '/messages', { headers: as('alex') })).json() as { messages: { kind: string }[] };
  const museCount = msgs.messages.filter((m) => m.kind === 'muse').length;
  console.log('MUSE_NOTES=' + museCount);
  for (const h of ['alex', 'jordan']) await request.post('/api/intros/reset', { headers: as(h) });
  expect(n, 'one intro notification for Jordan').toBe(1);
  expect(museCount, 'one Muse note').toBe(1);
});
