import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Throwaway verifier spec (db-load round 1). Alex at 1440, Maya at 390, two contexts.
const H = (handle: string) => ({ 'x-persona': handle });
type User = { id: string; handle: string };
const MIND = "What" + String.fromCharCode(39) + "s on your mind?";

async function ids(request: APIRequestContext) {
  const res = await request.get('/api/users', { headers: H('alex') });
  const { users } = (await res.json()) as { users: User[] };
  const by = (h: string) => users.find((u) => u.handle === h)!.id;
  return { alex: by('alex'), maya: by('maya') };
}

function counter(page: Page) {
  const hits: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/') && u.pathname !== '/api/realtime') hits.push(`${r.method()} ${u.pathname}`);
  });
  return {
    reset: () => { hits.length = 0; },
    tally: () => hits.reduce<Record<string, number>>((m, k) => { m[k] = (m[k] ?? 0) + 1; return m; }, {}),
  };
}

test('two personas live: plan, invite, together, walk, bubble; no refetch storm', async ({ browser, request }, info) => {
  test.skip(info.project.name !== 'desktop', 'runs once');
  test.setTimeout(240_000);
  const { alex: alexId, maya: mayaId } = await ids(request);
  const aCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const alex = await aCtx.newPage();
  const maya = await mCtx.newPage();
  const mNet = counter(maya);
    maya.on('response', async (r) => {
      const u = new URL(r.url());
      if (/\/walk$/.test(u.pathname) && r.request().method() === 'GET') {
        const b = await r.text().catch(() => '?');
        console.log(`[verify] maya walk GET t=${Date.now() % 100000} fresh=${r.request().headers()['x-fresh'] ?? JSON.stringify(Object.keys(r.request().headers()).filter((k) => k.startsWith('x-')))} ${r.status()} ${b.slice(0, 120)}`);
      }
    });
    maya.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[verify] maya console ${m.type()}: ${m.text().slice(0, 200)}`); });
  const log = (k: string, v: unknown) => console.log(`[verify] ${k}: ${JSON.stringify(v)}`);
  try {
    await alex.goto('/out-here?as=alex&mode=explore');
    await expect(alex.getByTestId('map-canvas')).toBeVisible({ timeout: 30_000 });
    await expect(alex.locator('[data-map-marker="quest"]').first()).toBeAttached({ timeout: 30_000 });
    await maya.goto('/out-here?as=maya&mode=explore');
    await expect(maya.getByTestId('map-canvas')).toBeVisible({ timeout: 30_000 });

    // 1. Maya creates a plan; Alex sees it within about 2 s.
    const title = `Verify boba ${Date.now() % 100000}`;
    const t0 = Date.now();
    const loc = { lat: 37.4862, lng: -122.1490 };
    const created = await request.post('/api/quests', { headers: H('maya'), data: {
      title, emoji: '🧋', category: 'food', venueName: 'Verify Boba Bar', location: loc,
      startsAt: new Date(Date.now() + 10 * 60_000).toISOString(), endsAt: new Date(Date.now() + 80 * 60_000).toISOString(),
      capacity: 6, visibility: 'open',
    } });
    expect(created.status(), await created.text()).toBe(200);
    const quest = ((await created.json()) as { quest: { id: string } }).quest;
    await expect(alex.locator(`[data-map-marker="quest"][aria-label^="${title},"]`)).toHaveCount(1, { timeout: 2_500 });
    log('plan visible to alex ms', Date.now() - t0);

    const join = await request.post(`/api/quests/${quest.id}/join`, { headers: H('alex'), data: { userId: alexId } });
    expect(join.status(), await join.text()).toBe(200);

    // 2. Alex invites Maya; Maya sees the invite card. Edge: Maya double-clicks Accept.
    const t1 = Date.now();
    const inv = await request.post('/api/invites', { headers: H('alex'), data: {
      fromId: alexId, toId: mayaId, questId: null, suggestionTitle: 'Coffee after?', message: 'coffee after the boba?',
    } });
    expect(inv.status(), await inv.text()).toBe(200);
    const card = maya.getByTestId('invite-card').filter({ hasText: /coffee/i });
    await expect(card).toBeVisible({ timeout: 3_000 });
    log('invite visible to maya ms', Date.now() - t1);
    mNet.reset();
    await card.getByRole('button', { name: 'Accept' }).dblclick();
    await expect(maya.getByTestId('invite-result').first()).toBeVisible({ timeout: 5_000 });
    log('maya requests after dblclick accept', mNet.tally());

    // 3. Plan together.
    for (const [h, id] of [['alex', alexId], ['maya', mayaId]] as const) {
      const av = await request.post('/api/availability', { headers: H(h), data: {
        userId: id, text: 'free for an hour', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 90 * 60_000).toISOString(), location: loc,
      } });
      expect(av.status(), await av.text()).toBe(200);
    }
    const tg = await request.post('/api/together', { headers: H('alex'), data: { friendIds: [mayaId] } });
    expect(tg.status(), await tg.text()).toBe(200);
    const plan = ((await tg.json()) as { plan: { id: string; options: { questId: string }[]; status: string } }).plan;
    log('together options', plan.options.length);
    expect(plan.options.length).toBeGreaterThan(0);
    const opt = plan.options[0].questId;
    await expect.poll(async () => {
      const r = await request.get('/api/together', { headers: H('maya') });
      return ((await r.json()) as { plans: { id: string }[] }).plans.some((p) => p.id === plan.id);
    }, { timeout: 3_000 }).toBe(true);
    const v1 = await request.post(`/api/together/${plan.id}/vote`, { headers: H('alex'), data: { questId: opt, in: true } });
    expect(v1.status(), await v1.text()).toBe(200);
    const v2 = await request.post(`/api/together/${plan.id}/vote`, { headers: H('maya'), data: { questId: opt, in: true } });
    expect(v2.status(), await v2.text()).toBe(200);
    const locked = ((await v2.json()) as { plan: { status: string } }).plan.status;
    log('together status after both in', locked);
    expect(locked).toBe('confirmed');

    // 4. Maya opens 3D at 390; Alex walks toward the plan (a step every 1.6 s, like the 3D client).
    await maya.goto('/out-here?as=maya&view=3d');
    await expect(maya.getByTestId('out-here-map')).toHaveAttribute('data-view', '3d', { timeout: 30_000 });
    await maya.waitForTimeout(3000);
    mNet.reset();
    const start = { lat: loc.lat - 0.007, lng: loc.lng + 0.004 };
    const STEPS = 8;
    const labels: string[] = [];
    for (let i = 0; i < STEPS; i++) {
      const f = i / STEPS;
      const p = { lat: start.lat + (loc.lat - start.lat) * f, lng: start.lng + (loc.lng - start.lng) * f };
      console.log('[verify] alex step', i, Date.now() % 100000); const s = await request.post(`/api/quests/${quest.id}/walk`, { headers: H('alex'), data: { location: p } });
      expect(s.status(), await s.text()).toBe(200);
      await maya.waitForTimeout(1600);
      labels.push((await maya.getByTestId('world-walker').allTextContents()).join(' / ') + ' view=' + (await maya.getByTestId('out-here-map').getAttribute('data-view').catch(() => 'none')) + ' url=' + maya.url().replace(/^.*localhost:[0-9]+/, ''));
    }
    await maya.waitForTimeout(1000);
    const walkTally = mNet.tally();
    log('maya walker labels per step', labels);
    log('maya requests during 8 walk steps', walkTally);
    expect(labels.some((l) => /Alex/.test(l))).toBe(true);
    const walkGets = walkTally[`GET /api/quests/${quest.id}/walk`] ?? 0;
    expect(walkGets).toBeGreaterThanOrEqual(STEPS - 1);
    expect(walkGets).toBeLessThanOrEqual(STEPS + 2);
    for (const k of ['GET /api/notifications', 'GET /api/threads', 'GET /api/invites', 'GET /api/quests/mine', 'GET /api/together', 'GET /api/availability', 'GET /api/locations/me', 'GET /api/availability/free-with-me']) {
      expect(walkTally[k] ?? 0, k).toBe(0);
    }
    expect(walkTally['GET /api/locations/friends'] ?? 0).toBeLessThanOrEqual(STEPS + 2);

    // Edge: Alex keeps walking while Maya has her Notifications page open.
    await maya.goto('/notifications?as=maya');
    await maya.waitForTimeout(3000);
    mNet.reset();
    for (let i = 0; i < 4; i++) {
      await request.post(`/api/quests/${quest.id}/walk`, { headers: H('alex'), data: { location: { lat: loc.lat - 0.001 * (4 - i), lng: loc.lng } } });
      await maya.waitForTimeout(1600);
    }
    log('maya requests on /notifications during 4 steps', mNet.tally());
    expect(mNet.tally()['GET /api/notifications'] ?? 0).toBe(0);

    // 5. Maya edits her bubble at 390 (UI); Alex's friend pin updates within 2 s.
    await alex.goto('/out-here/friends?as=alex');
    await expect(alex.getByTestId('out-here-map')).toHaveAttribute('data-mode', 'friends', { timeout: 30_000 });
    const pin = alex.locator('[data-testid="friend-pin"][data-handle="maya"]');
    await expect(pin).toBeAttached({ timeout: 20_000 });
    await maya.goto('/out-here/friends?as=maya');
    await expect(maya.getByTestId('out-here-map')).toHaveAttribute('data-mode', 'friends', { timeout: 30_000 });
    if ((await maya.getByTestId('out-here-dock').getAttribute('data-level')) === '0') await maya.getByTestId('dock-handle').click();
    await maya.getByTestId('my-sharing-row').getByRole('button', { name: 'Edit' }).click();
    await maya.getByLabel(MIND).fill('verify tea time');
    const t2 = Date.now();
    await maya.getByRole('button', { name: 'Save' }).click();
    await expect(pin).toHaveAttribute('aria-label', /verify tea time/, { timeout: 2_500 });
    log('bubble visible to alex ms (from save click)', Date.now() - t2);
    await maya.screenshot({ path: 'test-results/verify-maya-390.png' });
    await alex.screenshot({ path: 'test-results/verify-alex-1440.png' });
  } finally {
    await request.put('/api/locations/me', { headers: H('maya'), data: { audience: 'friends', paused: false, bubble: { emoji: '🥟', thought: 'craving dumplings' } } }).catch(() => {});
    await aCtx.close();
    await mCtx.close();
  }
});
