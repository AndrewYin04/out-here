import { expect, test } from '@playwright/test';

// Timing and failure fixtures test ownership/presentation, not live Muse inference.
const emptyPicks = { topics: [], picks: [], hidden: [], checked: 0, videosRead: 2, source: 'muse', cached: true, ms: 1 };

test('Marketplace activity follows pending, error, cached empty result and navigation cancellation', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let release!: () => void;
  let requested = false;
  await page.route('**/api/muse/marketplace-picks?**', async (route) => {
    requested = true;
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ json: emptyPicks }).catch(() => undefined);
  });
  await page.goto('/marketplace?as=alex');
  await expect.poll(() => requested).toBe(true);
  await expect(page.getByTestId('muse-activity-status')).toContainText('loading picks');
  await expect(page.getByText('Reading what you watched this week…', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('marketplace-pending.png') });
  release();
  await expect(page.getByTestId('picks-empty')).toContainText('Nothing nearby fits');
  await expect(page.getByTestId('marketplace-for-you')).not.toContainText('will keep looking');
  await expect(page.locator('[data-muse-activity-owner]')).toHaveCount(0, { timeout: 6000 });

  await page.unroute('**/api/muse/marketplace-picks?**');
  await page.route('**/api/muse/marketplace-picks?**', (route) => route.fulfill({ status: 502, json: { error: 'Controlled failure' } }));
  await page.reload();
  await expect(page.getByTestId('marketplace-for-you').getByRole('alert')).toContainText('Couldn’t load your picks');
  await page.unroute('**/api/muse/marketplace-picks?**');
  await page.route('**/api/muse/marketplace-picks?**', (route) => route.fulfill({ json: emptyPicks }));
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByTestId('marketplace-for-you').getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('picks-empty')).toBeVisible();

  await page.unroute('**/api/muse/marketplace-picks?**');
  requested = false;
  await page.route('**/api/muse/marketplace-picks?**', async (route) => {
    requested = true;
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ json: emptyPicks }).catch(() => undefined);
  });
  await page.reload();
  await expect.poll(() => requested).toBe(true);
  await page.getByRole('link', { name: 'Watch', exact: true }).last().click();
  await expect(page).toHaveURL(/\/watch/);
  release();
  await expect(page.locator('[data-muse-activity-owner="marketplace-picks"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('crew regroup keeps approval explicit and releases a cancelled request', async ({ page }, info) => {
  let release!: () => void;
  let requested = false;
  await page.route('**/api/muse/regroup', async (route) => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    requested = true;
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ json: { suggestion: { questId: null, title: 'Controlled crew plan', whenText: 'This afternoon', reason: 'A fixture suggestion for this crew.' }, message: 'Would this work for everyone?', cached: true }, headers: { 'x-muse-mode': 'live' } }).catch(() => undefined);
  });
  await page.goto('/memories?as=alex');
  const crew = page.getByTestId('crew-card').first();
  await expect(crew).toBeVisible();
  await crew.getByRole('button', { name: 'Get this group together again', exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await expect(crew.getByTestId('muse-activity-status')).toContainText('looking for a plan');
  await page.screenshot({ path: info.outputPath('regroup-pending.png') });
  release();
  await expect(crew.getByTestId('regroup-suggestion')).toContainText('Controlled crew plan');
  await expect(crew.getByTestId('muse-activity-status')).toContainText('still needs to agree');
  await expect(crew.getByRole('button', { name: 'Send to crew', exact: true })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('regroup-result.png') });
  requested = false;
  await crew.getByRole('button', { name: 'Ask Muse again', exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await page.getByTestId('memories-back').click();
  await expect(page).toHaveURL(/\/out-here/);
  release();
  await expect(page.locator('[data-muse-activity-owner^="regroup:"]')).toHaveCount(0);
});

test('context caption names its inputs and preserves text edited while the response is pending', async ({ page, request }, info) => {
  const headers = { 'x-persona': 'alex' };
  // Reuse an authorized completed seed hangout rather than exhausting the daily host cap.
  const { crews } = await (await request.get('/api/crews', { headers })).json();
  expect(crews.length).toBeGreaterThan(0);
  const quest = { id: crews[0].originQuestId };
  let release!: () => void;
  let requested = false;
  await page.route('**/api/muse/caption', async (route) => {
    requested = true;
    expect(route.request().postDataJSON()).toEqual({ questId: quest.id });
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ json: { caption: 'A controlled title and venue caption.', mode: 'live', source: 'context', cached: true } }).catch(() => undefined);
  });
  await page.goto(`/out-here/plan/${quest.id}/memory?as=alex`);
  await expect.poll(() => requested).toBe(true);
  await expect(page.getByText('Story · Drafting from the title and venue…', { exact: true })).toBeVisible();
  await page.getByTestId('memory-story').fill('My own words while waiting');
  release();
  await expect(page.getByText('Muse’s caption suggestion uses the hangout title and venue, not the photo.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('memory-story')).toHaveValue('My own words while waiting');
  await page.screenshot({ path: info.outputPath('context-caption-edited.png') });
});
