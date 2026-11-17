import { devices, expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

// Throwaway verifier spec (round 3). Alex and Maya in separate contexts; Maya changes status and
// sharing, Alex must see each change within about 2 s. Records every 403 and console error.

type Pin = { friend: { handle: string }; precision: string; bubble: { thought: string | null } };
const H = (h: string) => ({ 'x-persona': h });
const log: string[] = [];
const bad: string[] = [];
const MIND = 'What' + String.fromCharCode(39) + 's on your mind?';

async function pins(request: APIRequestContext, h: string) {
  const r = await request.get('/api/locations/friends', { headers: H(h) });
  return ((await r.json()) as { pins: Pin[] }).pins;
}

function watch(page: Page, who: string) {
  page.on('response', (r) => { if (r.status() === 403 || r.status() >= 500) bad.push(`${who} ${r.status()} ${r.request().method()} ${r.url()}`); });
  page.on('console', (m) => { if (m.type() === 'error') bad.push(`${who} console: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => bad.push(`${who} pageerror: ${e.message.slice(0, 200)}`));
}

async function ctx(browser: Browser, width: number, who: string) {
  const opts = width < 800 ? { ...devices['Pixel 7'], viewport: { width, height: 844 } } : { viewport: { width, height: 900 } };
  const page = await (await browser.newContext(opts)).newPage();
  watch(page, `${who}@${width}`);
  return page;
}

async function openFriends(page: Page, h: string) {
  await page.goto(`/out-here/friends?as=${h}`);
  await expect(page.getByTestId('out-here-map')).toHaveAttribute('data-mode', 'friends', { timeout: 20_000 });
  await expect(page.locator('[data-testid="friend-pin"]').first()).toBeVisible({ timeout: 20_000 });
}

async function timed(label: string, fn: () => Promise<void>) {
  const t = Date.now();
  try { await fn(); log.push(`${label}: ${Date.now() - t} ms`); }
  catch (e) { log.push(`${label}: FAILED after ${Date.now() - t} ms: ${(e as Error).message.split('\n')[0]}`); throw e; }
}

const restore = (request: APIRequestContext) => request.put('/api/locations/me', {
  headers: H('maya'),
  data: { audience: 'friends', paused: false, precision: 'exact', bubble: { emoji: '🥟', thought: 'craving dumplings', doing: null, wantsTo: null } },
});

test.describe.configure({ mode: 'default' });
test.afterAll(() => { console.log('TIMINGS\n' + log.join('\n')); console.log('BAD\n' + (bad.join('\n') || '(none)')); });

for (const width of [1440, 390]) {
  test(`Maya changes status and sharing, Alex sees it live at ${width}`, async ({ browser, request }) => {
    test.setTimeout(180_000);
    const a = await ctx(browser, width, 'alex');
    const b = await ctx(browser, width, 'maya');
    const alexSeesMaya = async () => (await pins(request, 'alex')).find((p) => p.friend.handle === 'maya');
    try {
      await openFriends(a, 'alex');
      await openFriends(b, 'maya');

      // Maya opens People; it must list friends, Alex among them
      await b.getByRole('button', { name: /^People/ }).click();
      await expect(b.getByTestId('people-row').first()).toBeVisible();
      await expect(b.locator('[data-testid="people-row"][data-handle="alex"]')).toHaveCount(1);
      await b.screenshot({ path: `test-results/verify-r3-people-${width}.png` });
      await b.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

      // Alex opens the card of Maya from People; it stays open while Maya edits
      await a.getByRole('button', { name: /^People/ }).click();
      await a.locator('[data-testid="people-row"][data-handle="maya"]').click();
      const card = a.getByTestId('friend-card');
      await expect(card).toContainText('craving dumplings');

      // 1. bubble edit
      await b.getByRole('button', { name: 'Your status' }).click();
      await b.getByRole('button', { name: 'Emoji 🧋' }).click();
      await b.getByLabel(MIND).fill('boba run anyone');
      await b.getByLabel('What are you doing?').fill('leaving work at 5:15');
      await b.getByRole('button', { name: 'Save status' }).click();
      await timed(`[${width}] bubble edit reaches the open card of Alex`, () => expect(card).toContainText('boba run anyone', { timeout: 2_500 }));
      await expect(card).toContainText('leaving work at 5:15');

      // 2. approximate
      await b.getByRole('button', { name: 'Your status' }).click();
      const form = b.getByTestId('sharing-form');
      await form.getByText('Approximate', { exact: true }).click();
      await timed(`[${width}] approximate reaches the card of Alex`, () => expect(card).toContainText('Approximate location', { timeout: 2_500 }));
      expect((await alexSeesMaya())?.precision).toBe('approximate');

      // 3. pause, then Undo from the toast while the sheet stays open
      const sw = b.getByRole('switch', { name: 'Share my location' });
      await sw.click();
      await timed(`[${width}] pause hides Maya for Alex (API)`, () => expect.poll(alexSeesMaya, { timeout: 2_500, intervals: [200] }).toBeUndefined());
      await timed(`[${width}] pause removes the Maya pin on the map of Alex`, () => expect(a.locator('[data-testid="friend-pin"][data-handle="maya"]')).toHaveCount(0, { timeout: 2_500 }));
      log.push(`[${width}] alex card count after pause: ${await card.count()}`);
      await b.getByRole('button', { name: 'Undo' }).click();
      await timed(`[${width}] Undo brings Maya back (API)`, () => expect.poll(alexSeesMaya, { timeout: 2_500, intervals: [200] }).toBeTruthy());
      await b.waitForTimeout(800);
      const checked = await sw.getAttribute('aria-checked');
      const status = await b.getByTestId('sharing-status').innerText();
      log.push(`[${width}] after Undo, open sheet switch aria-checked=${checked}; status="${status}"`);
      await b.screenshot({ path: `test-results/verify-r3-after-undo-${width}.png` });
      expect.soft(checked, 'switch in the still-open sheet should show sharing ON after Undo').toBe('true');

      // 4. double click on the switch (edge case): server and UI must agree
      await sw.dblclick();
      await b.waitForTimeout(1500);
      const uiPaused = (await sw.getAttribute('aria-checked')) === 'false';
      const srvPaused = ((await (await request.get('/api/locations/me', { headers: H('maya') })).json()).share.paused) as boolean;
      log.push(`[${width}] after dblclick: ui paused=${uiPaused}, server paused=${srvPaused}`);
      expect.soft(uiPaused, 'switch state matches the server after a double click').toBe(srvPaused);
      await restore(request);

      // 5. Close friends (Alex is in the list of Maya): Alex keeps seeing her
      await b.getByRole('dialog').getByRole('button', { name: 'Close' }).click().catch(() => {});
      await b.getByTestId('sharing-button').click();
      await b.getByTestId('sharing-form').getByText('Close friends', { exact: true }).click();
      await b.waitForTimeout(1500);
      expect(await alexSeesMaya()).toBeTruthy();
      log.push(`[${width}] kai sees maya after Close friends: ${(await pins(request, 'kai')).some((p) => p.friend.handle === 'maya')}`);

      // 6. Only me hides her; then back to Friends
      await b.getByTestId('sharing-form').getByText('Only me', { exact: true }).click();
      await timed(`[${width}] Only me hides Maya for Alex`, () => expect.poll(alexSeesMaya, { timeout: 2_500, intervals: [200] }).toBeUndefined());
      await timed(`[${width}] Only me removes the pin on the map of Alex`, () => expect(a.locator('[data-testid="friend-pin"][data-handle="maya"]')).toHaveCount(0, { timeout: 2_500 }));
      await b.getByTestId('sharing-form').getByText('Friends', { exact: true }).click();
      await timed(`[${width}] Friends shows Maya again`, () => expect.poll(alexSeesMaya, { timeout: 2_500, intervals: [200] }).toBeTruthy());
    } finally {
      await restore(request);
      await a.context().close();
      await b.context().close();
    }
  });
}

test('390: Dumpling Den tap in Friends mode opens the quest, not a friend', async ({ browser }) => {
  const a = await ctx(browser, 390, 'alex');
  try {
    await openFriends(a, 'alex');
    const pin = a.getByTestId('quest-pin-dumplings');
    await expect(pin).toBeVisible();
    await a.waitForTimeout(1500);
    const box = (await pin.boundingBox())!;
    const top = await a.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid') ?? null, [box.x + box.width / 2, box.y + box.height / 2]);
    log.push(`[390] element on top of Dumpling Den center: ${top}`);
    await a.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(a.getByTestId('quest-sheet')).toBeVisible();
    await a.screenshot({ path: 'test-results/verify-r3-dumpling-390.png' });
    await expect(a.getByTestId('friend-card')).toHaveCount(0);
    // fast Explore/Friends toggling
    for (let i = 0; i < 3; i++) {
      await a.getByTestId('map-mode-explore').click();
      await a.getByTestId('map-mode-friends').click();
    }
    await expect(a.getByTestId('out-here-map')).toHaveAttribute('data-mode', 'friends');
    await expect(a.locator('[data-testid="friend-pin"]').first()).toBeVisible();
  } finally { await a.context().close(); }
});

test('fast persona switching on the Friends map produces no 403', async ({ browser }) => {
  for (const width of [1440, 390]) {
    const p = await ctx(browser, width, `switcher${width}`);
    try {
      await openFriends(p, 'alex');
      for (const name of [/Maya Chen/, /^Alex/, /Maya Chen/]) {
        await p.getByTestId('account-button').click();
        await p.getByTestId('persona-list').getByRole('menuitem', { name }).click();
      }
      await expect(p.getByTestId('account-button')).toHaveAttribute('aria-label', 'Account: Maya Chen');
      await expect(p.locator('[data-testid="friend-pin"]').first()).toBeVisible({ timeout: 15_000 });
      await p.waitForTimeout(2000);
      log.push(`[${width}] after switching to maya, maya pin count: ${await p.locator('[data-testid="friend-pin"][data-handle="maya"]').count()}, alex pin count: ${await p.locator('[data-testid="friend-pin"][data-handle="alex"]').count()}`);
      await p.getByRole('button', { name: /^People/ }).click();
      await expect(p.getByTestId('people-row').first()).toBeVisible();
      log.push(`[${width}] people list contains Maya Chen: ${(await p.getByTestId('people-list').innerText()).includes('Maya Chen')}`);
      await p.screenshot({ path: `test-results/verify-r3-switch-${width}.png` });
    } finally { await p.context().close(); }
  }
  const forb = bad.filter((s) => s.startsWith('switcher') && s.includes(' 403 '));
  expect(forb, forb.join('\n')).toEqual([]);
});
