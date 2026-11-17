import { expect, test, type Browser, type Page } from '@playwright/test';

// Throwaway verifier flow: Alex on a 390 px phone, Maya at 1440, two contexts, one server.
test.describe.configure({ mode: 'serial' });
const as = (h: string) => ({ 'x-persona': h });
const PLACEHOLDER = 'hungry, got like 40 min, under $15';
const DUMP = 'Dumplings before the rush';
const MIND = "What's on your mind?";
const FREE = "I'm free";

async function ctx(browser: Browser, handle: string, width: number, path: string): Promise<Page> {
  const c = await browser.newContext(width < 800
    ? { viewport: { width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
    : { viewport: { width, height: 900 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => console.log(`[${handle}] pageerror ${e.message}`));
  await p.goto(`${path}${path.includes('?') ? '&' : '?'}as=${handle}`);
  return p;
}
async function openPeople(page: Page) {
  const tab = page.getByTestId('map-mode-friends');
  if ((await tab.getAttribute('aria-pressed')) !== 'true') await tab.click();
  if ((await page.getByTestId('out-here-dock').getAttribute('data-level')) === '0') await page.getByTestId('dock-handle').click();
}
async function editStatus(page: Page) {
  await openPeople(page);
  await page.getByTestId('my-sharing-row').getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByTestId('sharing-form')).toBeVisible();
}

test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop-parallel', 'one run'); });

test('V1 Find My: bubble visible, edit seen live, pause + Undo', async ({ browser, request }) => {
  test.setTimeout(150_000);
  const alex = await ctx(browser, 'alex', 390, '/out-here/friends');
  const maya = await ctx(browser, 'maya', 1440, '/out-here/friends');
  try {
    await expect(alex.getByTestId('out-here-map')).toHaveAttribute('data-mode', 'friends');
    const pin = alex.locator('[data-testid="friend-pin"][data-handle="maya"]');
    await expect(pin).toBeVisible({ timeout: 15_000 });
    await expect(pin).toHaveAttribute('aria-label', /craving dumplings/);
    await alex.screenshot({ path: 'test-results/_verify/v1-alex-390.png' });

    await expect(maya.locator('[data-testid="friend-pin"]').first()).toBeVisible({ timeout: 15_000 });
    await editStatus(maya);
    const thought = `tacos instead ${Date.now() % 10000}`;
    await maya.getByLabel(MIND).fill(thought);
    const t0 = Date.now();
    await maya.getByRole('button', { name: 'Save status' }).dblclick();
    await expect(maya.getByText('Your status is updated').first()).toBeVisible();
    await expect(pin).toHaveAttribute('aria-label', new RegExp(thought), { timeout: 2_500 });
    console.log(`V1 bubble propagated in ${Date.now() - t0} ms`);
    await alex.screenshot({ path: 'test-results/_verify/v1-alex-after-edit-390.png' });

    await editStatus(maya);
    const sw = maya.getByRole('switch', { name: 'Share my location' });
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    const t1 = Date.now();
    await sw.click();
    await expect(maya.getByText('Location sharing paused').first()).toBeVisible();
    await expect(pin).toHaveCount(0, { timeout: 2_500 });
    console.log(`V1 pause propagated in ${Date.now() - t1} ms`);
    const t2 = Date.now();
    await maya.getByRole('button', { name: 'Undo' }).click();
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await expect(pin).toBeVisible({ timeout: 2_500 });
    console.log(`V1 undo propagated in ${Date.now() - t2} ms`);
    await expect(pin).toHaveAttribute('aria-label', new RegExp(thought));
    await maya.screenshot({ path: 'test-results/_verify/v1-maya-1440.png' });
  } finally {
    await request.put('/api/locations/me', { headers: as('maya'), data: { audience: 'friends', paused: false, bubble: { emoji: '🥟', thought: 'craving dumplings' } } });
    await alex.context().close(); await maya.context().close();
  }
});

test('V2 free -> Muse plan -> invite Maya -> accept -> seats live on both', async ({ browser }) => {
  test.setTimeout(120_000);
  const alex = await ctx(browser, 'alex', 390, '/out-here?mode=explore');
  const maya = await ctx(browser, 'maya', 1440, '/out-here?mode=explore');
  try {
    const dp = alex.getByTestId('quest-pin-dumplings');
    await expect(dp).toBeVisible({ timeout: 15_000 });
    await alex.waitForTimeout(1500);
    const vb = await dp.boundingBox();
    console.log('V2 dumpling pin box at 390: ' + JSON.stringify(vb));
    await alex.screenshot({ path: 'test-results/_verify/v2-alex-explore-390.png' });
    await alex.getByRole('button', { name: FREE }).click();
    await expect(alex.getByTestId('plan-sheet')).toBeVisible();
    await alex.locator('#imfree-text').fill(PLACEHOLDER);
    await alex.getByRole('button', { name: 'Find a plan' }).click();
    await expect(alex.getByTestId('plan-loading')).toHaveCount(0, { timeout: 20_000 });
    const top = alex.getByTestId('suggestion').first();
    await expect(top).toContainText(DUMP);
    await expect(top.getByTestId('seats-left')).toHaveText('2 left');
    await alex.screenshot({ path: 'test-results/_verify/v2-alex-plan-390.png' });
    const go = top.getByRole('button', { name: 'Go with Maya' });
    await go.scrollIntoViewIfNeeded();
    await go.dblclick();
    await expect(top.getByTestId('waiting-for-friend')).toContainText('Waiting for Maya', { timeout: 5_000 });
    const inv = await maya.request.get('/api/invites', { headers: as('maya') });
    const pending = (await inv.json()).incoming.filter((i: { suggestionTitle: string; status: string }) => i.suggestionTitle === DUMP && i.status === 'pending');
    console.log(`V2 pending invites to Maya after double tap: ${pending.length}`);
    expect(pending.length).toBe(1);

    const card = maya.getByTestId('invite-card').filter({ hasText: DUMP });
    await expect(card).toBeVisible({ timeout: 5_000 });
    await expect(card.getByTestId('seats-left')).toHaveText('1 left');
    await maya.screenshot({ path: 'test-results/_verify/v2-maya-invite-1440.png' });
    await card.getByRole('button', { name: 'Accept' }).click();
    await expect(card.getByTestId('invite-result')).toContainText('in with Alex');
    await expect(card.getByTestId('seats-left')).toHaveText('Full', { timeout: 3_000 });
    await expect(top.getByTestId('seats-left')).toHaveText('Full', { timeout: 3_000 });
    await expect(top.getByTestId('invite-outcome')).toContainText('Maya', { timeout: 3_000 });
    await alex.screenshot({ path: 'test-results/_verify/v2-alex-full-390.png' });
  } finally {
    await alex.context().close(); await maya.context().close();
  }
});

test('V3 Messenger both ways, Alex 390 and Maya 1440', async ({ browser }) => {
  test.setTimeout(90_000);
  const alex = await ctx(browser, 'alex', 390, '/messages');
  const maya = await ctx(browser, 'maya', 1440, '/messages');
  try {
    await alex.locator('[data-testid="thread-row"][data-title^="Maya"]').first().click();
    await expect(alex.getByTestId('conversation-title')).toHaveText(/Maya/);
    await maya.locator('[data-testid="thread-row"][data-title^="Alex"]').first().click();
    await expect(maya.getByTestId('conversation-title')).toHaveText(/Alex/);
    const a = `verify a to m ${Date.now()}`;
    let t = Date.now();
    await alex.getByTestId('composer-input').fill(a);
    await alex.getByTestId('send-button').dblclick();
    await expect(maya.getByTestId('bubble-theirs').filter({ hasText: a })).toBeVisible({ timeout: 3_000 });
    console.log(`V3 a to m ${Date.now() - t} ms`);
    await alex.waitForTimeout(800);
    const copies = await alex.getByTestId('bubble-mine').filter({ hasText: a }).count();
    console.log(`V3 copies on alex after double tap: ${copies}`);
    const m = `verify m to a ${Date.now()}`;
    t = Date.now();
    await maya.getByTestId('composer-input').fill(m);
    await maya.getByTestId('composer-input').press('Enter');
    await expect(alex.getByTestId('bubble-theirs').filter({ hasText: m })).toBeVisible({ timeout: 3_000 });
    console.log(`V3 m to a ${Date.now() - t} ms`);
    await expect(alex.getByTestId('composer-input')).toBeInViewport();
    await alex.screenshot({ path: 'test-results/_verify/v3-alex-390.png' });
    expect(copies).toBe(1);
  } finally {
    await alex.context().close(); await maya.context().close();
  }
});

test('V4 Muse Intros: round finds Jordan, both accept', async ({ browser, request }) => {
  test.setTimeout(120_000);
  for (const h of ['alex', 'jordan']) expect((await request.post('/api/intros/reset', { headers: as(h) })).ok()).toBe(true);
  const alex = await ctx(browser, 'alex', 390, '/intros');
  try {
    await expect(alex.getByRole('heading', { name: 'Intros from Muse' })).toBeVisible({ timeout: 20_000 });
    await alex.getByTestId('run-round').dblclick();
    const card = alex.locator('[data-testid="intro-card"][data-handle="jordan"]');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await alex.waitForTimeout(1000);
    await expect(alex.getByTestId('intro-card')).toHaveCount(1);
    await expect(card.getByTestId('trust-path').first()).toContainText('Maya');
    await alex.screenshot({ path: 'test-results/_verify/v4-alex-card-390.png' });
    await card.getByRole('button', { name: 'Accept' }).click();
    await expect(card.getByTestId('intro-status')).toHaveText('Waiting for Jordan');
    const jordan = await ctx(browser, 'jordan', 1440, '/intros');
    const jCard = jordan.locator('[data-testid="intro-card"][data-handle="alex"]');
    await expect(jCard).toBeVisible({ timeout: 15_000 });
    await jCard.getByRole('button', { name: 'Accept' }).click();
    await expect(jCard.getByTestId('intro-status')).toHaveText("You're connected");
    await expect(card.getByTestId('intro-status')).toHaveText("You're connected", { timeout: 5_000 });
    await jordan.screenshot({ path: 'test-results/_verify/v4-jordan-1440.png' });
    await jordan.context().close();
  } finally {
    await alex.context().close();
  }
});
