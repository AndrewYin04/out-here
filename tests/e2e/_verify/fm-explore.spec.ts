import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

const PERSONAS = ['alex', 'maya', 'jordan', 'priya', 'sam', 'leo', 'nina', 'kai'];
type Pin = { friend: { handle: string }; location: { lat: number; lng: number }; precision: string; bubble: { thought: string | null } };
const H = (h: string) => ({ 'x-persona': h });
const MIND = /on your mind/;
const DUMPLING = '\u{1F95F}';

async function pins(request: APIRequestContext, h: string): Promise<Pin[]> {
  const r = await request.get('/api/locations/friends', { headers: H(h) });
  expect(r.ok()).toBe(true);
  return ((await r.json()) as { pins: Pin[] }).pins;
}
const mayaFor = async (req: APIRequestContext, h: string) => (await pins(req, h)).find((p) => p.friend.handle === 'maya');
function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

type Watch = { errors: string[]; forbidden: string[]; fetches: { t: number; maya: boolean }[] };
async function newPage(browser: Browser, width: number): Promise<{ page: Page; w: Watch }> {
  const ctx = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 900 }, isMobile: width < 800, hasTouch: width < 800 });
  const page = await ctx.newPage();
  const w: Watch = { errors: [], forbidden: [], fetches: [] }; page.on('response', async (r) => { if (new URL(r.url()).pathname === '/api/locations/friends') { try { const j = await r.json(); w.fetches.push({ t: Date.now(), maya: JSON.stringify(j).includes('"handle":"maya"') }); } catch { /* ignore */ } } });
  page.on('console', (m) => { if (m.type() === 'error') w.errors.push(m.text()); });
  page.on('pageerror', (e) => w.errors.push('pageerror: ' + e.message));
  page.on('response', (r) => { if (r.status() === 403 || r.status() >= 500) w.forbidden.push(r.status() + ' ' + r.request().method() + ' ' + new URL(r.url()).pathname); });
  return { page, w };
}
async function openFriends(page: Page, h: string) {
  await page.goto('/out-here/friends?as=' + h);
  await expect(page.getByTestId('out-here-map')).toHaveAttribute('data-mode', 'friends', { timeout: 20_000 });
  await expect(page.locator('[data-testid="friend-pin"]').first()).toBeVisible({ timeout: 20_000 });
}
async function resetMaya(request: APIRequestContext) {
  await request.put('/api/locations/me', { headers: H('maya'), data: { audience: 'friends', paused: false, precision: 'approximate', bubble: { emoji: DUMPLING, thought: 'craving dumplings', doing: null, wantsTo: null } } });
}



for (const width of [390, 1440]) {
  test('sharing changes reach Alex live at ' + width, async ({ browser, request }) => {
    test.setTimeout(150_000);
    const A = await newPage(browser, width);
    const B = await newPage(browser, width);
    const timings: Record<string, number> = {};
    try {
      await openFriends(A.page, 'alex');
      await openFriends(B.page, 'maya');
      const mayaPin = A.page.locator('[data-testid="friend-pin"][data-handle="maya"]');
      await expect(mayaPin).toHaveAttribute('aria-label', /craving dumplings/);
      const before = await mayaFor(request, 'alex');
      console.log(width, 'maya precision seen by alex:', before?.precision);

      for (const name of [/^People/, /^Your status$/]) {
        const btn = B.page.getByRole('button', { name });
        await expect(btn).toBeVisible();
        const box = (await btn.boundingBox())!;
        const top = await B.page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e?.closest('button')?.textContent ?? e?.tagName; }, [box.x + box.width / 2, box.y + box.height / 2]);
        console.log(width, 'element at center of', String(name), ':', top, JSON.stringify(box));
      }

      await B.page.getByRole('button', { name: 'Your status' }).click();
      await B.page.getByLabel(MIND).fill('boba run anyone?');
      await B.page.getByLabel('What are you doing?').fill('leaving work');
      let t0 = Date.now();
      await B.page.getByRole('button', { name: 'Save' }).dblclick();
      await expect(mayaPin).toHaveAttribute('aria-label', /boba run anyone/, { timeout: 5_000 });
      timings.bubble = Date.now() - t0;
      await expect(B.page.getByText('Your status is updated').first()).toBeVisible();
      await B.page.screenshot({ path: 'test-results/verify-maya-after-save-' + width + '.png' });

      await A.page.getByRole('button', { name: /^People/ }).click();
      const row = A.page.locator('[data-testid="people-row"][data-handle="maya"]');
      await expect(row).toContainText('boba run anyone', { timeout: 3_000 });
      const rows = await A.page.locator('[data-testid="people-row"]').allTextContents();
      console.log(width, 'people rows:', rows.map((d) => d.slice(0, 70)));
      await A.page.screenshot({ path: 'test-results/verify-alex-people-' + width + '.png' });
      await A.page.keyboard.press('Escape');

      await B.page.getByRole('button', { name: 'Your status' }).click();
      await B.page.getByText('Exact', { exact: true }).click();
      await B.page.getByRole('button', { name: 'Save' }).click();
      await expect(B.page.getByTestId('sharing-form')).toBeHidden();
      await expect.poll(async () => (await mayaFor(request, 'alex'))?.precision).toBe('exact');
      const exact = (await mayaFor(request, 'alex'))?.location as { lat: number; lng: number };
      await B.page.getByRole('button', { name: 'Your status' }).click();
      await B.page.getByText('Approximate', { exact: true }).click();
      await B.page.getByRole('button', { name: 'Save' }).click();
      await expect(B.page.getByTestId('sharing-form')).toBeHidden();
      await expect.poll(async () => (await mayaFor(request, 'alex'))?.precision).toBe('approximate');
      const ap1 = (await mayaFor(request, 'alex'))?.location as { lat: number; lng: number };
      const ap2 = (await mayaFor(request, 'alex'))?.location as { lat: number; lng: number };
      console.log(width, 'approx offset m:', Math.round(meters(exact, ap1)), 'repeat drift m:', Math.round(meters(ap1, ap2)));

      const seersBefore: string[] = [];
      for (const h of PERSONAS) if (h !== 'maya' && (await mayaFor(request, h))) seersBefore.push(h);
      await B.page.getByRole('button', { name: 'Your status' }).click();
      await B.page.getByText('Close friends', { exact: true }).click();
      await B.page.getByRole('button', { name: 'Save' }).click();
      await expect(B.page.getByTestId('sharing-form')).toBeHidden();
      const seersAfter: string[] = [];
      for (const h of PERSONAS) if (h !== 'maya' && (await mayaFor(request, h))) seersAfter.push(h);
      console.log(width, 'seers friends:', seersBefore, 'close friends:', seersAfter);
      await expect(mayaPin).toBeVisible();

      await B.page.getByRole('button', { name: 'Your status' }).click();
      await B.page.getByRole('switch', { name: 'Pause sharing' }).click();
      const putAt: number[] = []; B.page.on('request', (q) => { if (q.method() === 'PUT' && q.url().includes('/api/locations/me')) putAt.push(Date.now()); });
      const shot = await B.page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Save'); if (!b) return 'no save'; const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { save: [r.x, r.y, r.width, r.height], top: e ? (e.closest('[role=status],[data-testid],button') || e).outerHTML.slice(0, 160) : null }; });
      console.log(width, 'what covers Save:', JSON.stringify(shot));
      t0 = Date.now();
      await B.page.getByRole('button', { name: 'Save' }).click();
      console.log(width, 'save click returned after ms', Date.now() - t0, 'PUT sent at ms', putAt.map((p) => p - t0));
      await expect(mayaPin).toHaveCount(0, { timeout: 5_000 });
      timings.pause = Date.now() - t0; console.log(width, 'alex friends fetches after pause save (ms, maya present):', JSON.stringify(A.w.fetches.filter((f) => f.t >= t0).map((f) => [f.t - t0, f.maya])));
      expect(await mayaFor(request, 'alex')).toBeUndefined();
      await B.page.getByRole('button', { name: 'Your status' }).click();
      await expect(B.page.getByRole('switch', { name: 'Pause sharing' })).toHaveAttribute('aria-checked', 'true');
      await B.page.getByRole('switch', { name: 'Pause sharing' }).click();
      t0 = Date.now();
      await B.page.getByRole('button', { name: 'Save' }).click();
      await expect(mayaPin).toHaveCount(1, { timeout: 5_000 });
      timings.resume = Date.now() - t0;
      console.log(width, 'live timings ms:', JSON.stringify(timings));
      console.log(width, 'A forbidden/5xx:', A.w.forbidden, 'B:', B.w.forbidden);
      console.log(width, 'A errors:', A.w.errors.slice(0, 5), 'B:', B.w.errors.slice(0, 5));
      expect(meters(exact, ap1)).toBeGreaterThan(50);
      expect(meters(exact, ap1)).toBeLessThan(1500);
      expect(meters(ap1, ap2)).toBeLessThan(1);
      for (const [k, v] of Object.entries(timings)) expect(v, k + ' live latency').toBeLessThan(2_500);
      expect([...A.w.forbidden, ...B.w.forbidden]).toEqual([]);
    } finally {
      await resetMaya(request);
      await A.page.context().close();
      await B.page.context().close();
    }
  });
}

test('tap Dumpling Den in Friends mode at 390', async ({ browser }) => {
  const A = await newPage(browser, 390);
  try {
    await openFriends(A.page, 'alex');
    await A.page.waitForTimeout(1500);
    const pin = A.page.getByTestId('quest-pin-dumplings');
    console.log('dumplings pin count in friends mode:', await pin.count());
    await A.page.screenshot({ path: 'test-results/verify-friends-390-before-tap.png' });
    await expect(pin).toBeVisible({ timeout: 10_000 });
    const box = await pin.boundingBox();
    const cx = box!.x + box!.width / 2, cy = box!.y + box!.height / 2;
    const hit = await A.page.evaluate(([x, y]) => {
      const e = document.elementFromPoint(x, y) as HTMLElement | null;
      const t = e ? e.closest('[data-testid]') : null;
      return { tag: e ? e.tagName : null, tid: t ? t.getAttribute('data-testid') : null };
    }, [cx, cy]);
    console.log('element at dumplings pin center:', JSON.stringify(hit), JSON.stringify(box));
    await A.page.touchscreen.tap(cx, cy);
    await expect(A.page.getByRole('dialog').filter({ hasText: 'Dumpling Den' }).first()).toBeVisible({ timeout: 5_000 });
    await A.page.screenshot({ path: 'test-results/verify-friends-390-dumplings.png' });
    console.log('A forbidden:', A.w.forbidden, 'errors:', A.w.errors.slice(0, 5));
    expect(A.w.forbidden).toEqual([]);
  } finally { await A.page.context().close(); }
});

for (const width of [390, 1440]) {
  test('fast persona switching on the Friends map at ' + width, async ({ browser }) => {
    const A = await newPage(browser, width);
    try {
      await openFriends(A.page, 'alex');
      const switchTo = async (name: string) => {
        await A.page.getByRole('button', { name: /^Account/ }).first().click();
        await A.page.getByTestId('persona-list').getByText(name, { exact: false }).first().click();
      };
      await switchTo('Maya');
      await switchTo('Jordan');
      await switchTo('Maya');
      await expect(A.page.getByRole('button', { name: /Account: Maya/ }).first()).toBeVisible({ timeout: 10_000 });
      await A.page.waitForTimeout(2500);
      await expect(A.page.locator('[data-testid="friend-pin"][data-handle="alex"]')).toBeVisible({ timeout: 10_000 });
      await expect(A.page.locator('[data-testid="friend-pin"][data-handle="maya"]')).toHaveCount(0);
      await A.page.goto('/out-here/friends?as=kai');
      await expect(A.page.getByRole('button', { name: /Account: Kai/ }).first()).toBeVisible({ timeout: 10_000 });
      await A.page.waitForTimeout(2500);
      await expect(A.page.locator('[data-testid="friend-pin"][data-handle="kai"]')).toHaveCount(0);
      await A.page.screenshot({ path: 'test-results/verify-switch-' + width + '.png' });
      console.log(width, 'switch forbidden/5xx:', A.w.forbidden, 'errors:', A.w.errors.slice(0, 8));
      expect(A.w.forbidden).toEqual([]);
    } finally { await A.page.context().close(); }
  });
}
