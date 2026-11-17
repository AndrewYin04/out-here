import { expect, test, type Browser, type Page } from '@playwright/test';

// Throwaway verifier flow: Alex (1440) and Jordan (390 phone) accept a Muse intro, then chat
// in the thread Muse opened. Edge cases: double-click on Run round and Accept, a non-member
// opening the thread URL, a burst of messages, and fast thread switching.
const as = (h: string) => ({ 'x-persona': h });
const CONNECTED = 'You\u2019re connected'.replace('\u2019', "'");

async function open(browser: Browser, handle: string, width: number, path: string, errs: string[]): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 900 }, isMobile: width < 800, hasTouch: width < 800 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(handle + ': ' + e.message));
  await page.goto(path + (path.includes('?') ? '&' : '?') + 'as=' + handle);
  return page;
}

test.describe('verify: intro -> chat', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'once'); });

  test('Alex and Jordan accept an intro and chat live in the Muse thread', async ({ browser, request }) => {
    test.setTimeout(180_000);
    const errs: string[] = [];
    for (const h of ['alex', 'jordan']) expect((await request.post('/api/intros/reset', { headers: as(h) })).ok()).toBe(true);

    const alex = await open(browser, 'alex', 1440, '/intros', errs);
    await expect(alex.getByRole('heading', { name: 'Intros from Muse' })).toBeVisible({ timeout: 20_000 });
    const jordan = await open(browser, 'jordan', 390, '/intros', errs);
    await expect(jordan.getByRole('heading', { name: 'Intros from Muse' })).toBeVisible({ timeout: 20_000 });
    await expect(jordan.getByTestId('intro-card')).toHaveCount(0);

    await alex.getByTestId('run-round').dblclick();
    const card = alex.locator('[data-testid="intro-card"][data-handle="jordan"]');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await alex.waitForTimeout(1500);
    await expect(alex.getByTestId('intro-card')).toHaveCount(1);

    await card.getByRole('button', { name: 'Accept' }).dblclick();
    await expect(card.getByTestId('intro-status')).toHaveText('Waiting for Jordan');
    const notes = await (await request.get('/api/notifications', { headers: as('jordan') })).json() as { notifications: { type: string }[] };
    expect(notes.notifications.filter((n) => n.type === 'intro'), 'one intro notification after double accept').toHaveLength(1);

    const jCard = jordan.locator('[data-testid="intro-card"][data-handle="alex"]');
    let jordanLive = true;
    try { await expect(jCard).toBeVisible({ timeout: 5000 }); } catch { jordanLive = false; await jordan.reload(); await expect(jCard).toBeVisible({ timeout: 20_000 }); }
    console.log('JORDAN_CARD_LIVE_WITHOUT_RELOAD=' + jordanLive);
    await jCard.getByRole('button', { name: 'Accept' }).dblclick();
    await expect(jCard.getByTestId('intro-status')).toHaveText(CONNECTED);
    const t0 = Date.now();
    await expect(card.getByTestId('intro-status')).toHaveText(CONNECTED, { timeout: 10_000 });
    console.log('ALEX_CONNECTED_LAG_MS=' + (Date.now() - t0));

    const aHref = await card.getByRole('link', { name: 'Open chat' }).getAttribute('href');
    const jHref = await jCard.getByRole('link', { name: 'Open chat' }).getAttribute('href');
    expect(aHref).toBe(jHref);
    await card.getByRole('link', { name: 'Open chat' }).click();
    await jCard.getByRole('link', { name: 'Open chat' }).click();
    await expect(alex).toHaveURL(/\/messages\?thread=/);
    await expect(jordan).toHaveURL(/\/messages\?thread=/);
    await expect(alex.getByTestId('muse-note')).toHaveCount(1, { timeout: 20_000 });
    await expect(jordan.getByTestId('muse-note')).toHaveCount(1, { timeout: 20_000 });
    await expect(jordan.getByTestId('composer-input')).toBeInViewport();

    const m1 = 'pregame at 7? ' + Date.now();
    await alex.getByTestId('composer-input').fill(m1);
    await alex.getByTestId('composer-input').press('Enter');
    await expect(alex.getByTestId('bubble-mine').filter({ hasText: m1 })).toHaveCount(1);
    await expect(jordan.getByTestId('bubble-theirs').filter({ hasText: m1 })).toHaveCount(1, { timeout: 3000 });

    const m2 = 'down, see you there ' + Date.now();
    await jordan.getByTestId('composer-input').fill(m2);
    await jordan.getByTestId('send-button').dblclick();
    await expect(alex.getByTestId('bubble-theirs').filter({ hasText: m2 }).first()).toBeVisible({ timeout: 3000 });
    await alex.waitForTimeout(1500);
    await expect(alex.getByTestId('bubble-theirs').filter({ hasText: m2 }), 'double-tap sends once').toHaveCount(1);

    const burst = [1, 2, 3].map((i) => 'burst' + i + ' ' + Date.now());
    for (const b of burst) { await alex.getByTestId('composer-input').fill(b); await alex.getByTestId('composer-input').press('Enter'); }
    for (const b of burst) await expect(jordan.getByTestId('bubble-theirs').filter({ hasText: b })).toHaveCount(1, { timeout: 4000 });
    const jText = await jordan.getByTestId('message-list').innerText();
    const idx = burst.map((b) => jText.indexOf(b));
    expect(idx, 'burst order').toEqual([...idx].sort((a, b) => a - b));

    await jordan.getByRole('button', { name: 'Back to chats' }).click();
    const row = jordan.locator('[data-testid="thread-row"][data-title^="Alex"]').first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('burst3');

    const threadId = decodeURIComponent(aHref!.split('thread=')[1]);
    const mayaApi = await request.get('/api/threads/' + threadId + '/messages', { headers: as('maya') });
    console.log('MAYA_THREAD_STATUS=' + mayaApi.status());
    expect(mayaApi.ok(), 'maya cannot read the intro thread').toBe(false);
    const maya = await open(browser, 'maya', 1440, '/messages?thread=' + threadId, errs);
    await maya.waitForTimeout(3000);
    await expect(maya.getByText(m1)).toHaveCount(0);

    await alex.goto('/messages?as=alex');
    const mayaRow = alex.locator('[data-testid="thread-row"][data-title^="Maya"]').first();
    const jordanRow = alex.locator('[data-testid="thread-row"][data-title^="Jordan"]').first();
    await expect(jordanRow).toBeVisible();
    for (let i = 0; i < 3; i++) { await mayaRow.click(); await jordanRow.click(); }
    await expect(alex.getByTestId('conversation-title')).toHaveText(/Jordan/);
    await alex.waitForTimeout(2000);
    await expect(alex.getByTestId('bubble-theirs').filter({ hasText: m2 })).toHaveCount(1);
    await expect(alex.getByTestId('message-list')).toContainText(m1);
    await expect(alex.getByTestId('message-list')).not.toContainText('dumplings at 6?');
    await alex.screenshot({ path: 'test-results/verify-alex-final.png' });
    await jordan.screenshot({ path: 'test-results/verify-jordan-final.png'
 });

    expect(errs).toEqual([]);
    for (const h of ['alex', 'jordan']) await request.post('/api/intros/reset', { headers: as(h) });
  });
});
