import { expect, test, type Browser, type ConsoleMessage, type Page } from '@playwright/test';

// Groups and Notifications at 390 (phone project) and 1440 (desktop project).
// Mutations are split so the two projects never touch the same object: the phone joins and
// leaves "Boba & Sketch", the desktop "Film Photo Walks" and the Taco truck crawl hangout.

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    if (msg.text().startsWith('Failed to load resource') && msg.location().url.includes('/seed/')) return;
    errors.push(`${msg.text()} @ ${msg.location().url}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

async function personaPage(browser: Browser, handle: string, path: string, phone: boolean): Promise<Page> {
  const ctx = await browser.newContext(phone
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const sep = path.includes('?') ? '&' : '?';
  await page.goto(`${path}${sep}as=${handle}`);
  return page;
}

const hangout = (page: Page, title: string) => page.getByTestId('hangout').filter({ hasText: title });

test('Cheap Eats Hangouts tab shows Dumpling Den with 2 left', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/groups/cheap-eats-south-bay?as=alex');
  await expect(page.getByRole('heading', { level: 1, name: 'Cheap Eats South Bay' })).toBeVisible();
  await expect(page.getByTestId('group-meta')).toContainText(/Public group · \d+ members/);
  await expect(page.getByTestId('group-header-avatars')).toBeVisible();
  await expect(page.getByTestId('share-group')).toBeVisible();
  await page.getByRole('tab', { name: 'Hangouts' }).click();
  await expect(page).toHaveURL(/tab=hangouts/);
  const dumplings = hangout(page, 'Dumpling Den');
  await expect(dumplings).toBeVisible();
  await expect(dumplings.getByTestId('seats-badge')).toHaveText('2 left');
  await expect(dumplings).toContainText(/Starts in \d+|Happening now/);
  await expect(dumplings.getByRole('link', { name: 'Open in Out Here' })).toHaveAttribute('href', /\/out-here\?quest=/);
  expect(errors).toEqual([]);
});

test('Members tab lists friends first with the friend count', async ({ page }) => {
  await page.goto('/groups/cheap-eats-south-bay?tab=members&as=alex');
  await expect(page.getByTestId('friends-are-members')).toHaveText(/\d+ friends? (are|is) members?|1 friend is a member/);
  const first = page.getByTestId('member').first();
  await expect(first).toContainText('Friend');
});

test('Discussion shows group posts and a member can post', async ({ page }, info) => {
  await page.goto('/groups/cheap-eats-south-bay?as=alex');
  await expect(page.getByTestId('post').first()).toBeVisible();
  const text = `Anyone up for dumplings? (${info.project.name} ${Date.now()})`;
  await page.getByTestId('group-composer').fill(text);
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByTestId('post').first()).toContainText(text);
  await page.reload();
  await expect(page.getByTestId('post').filter({ hasText: text })).toBeVisible();
});

test('Join and leave a group from its page', async ({ page }, info) => {
  const slug = info.project.name === 'phone' ? 'boba-and-sketch' : 'film-photo-walks-bay';
  await page.goto(`/groups/${slug}?as=alex`);
  const meta = page.getByTestId('group-meta');
  await expect(meta).toBeVisible();
  const before = Number((await meta.textContent())!.match(/(\d+) members?/)![1]);
  await page.getByTestId('join-group').click();
  await expect(page.getByTestId('joined-group')).toBeVisible();
  await expect(meta).toContainText(`${before + 1} members`);
  await page.reload();
  await expect(page.getByTestId('joined-group')).toBeVisible();
  await page.getByTestId('joined-group').click();
  await page.getByRole('menuitem', { name: 'Leave group' }).click();
  await expect(page.getByTestId('join-group')).toBeVisible();
  await expect(meta).toContainText(`${before} member`);
});

test('Groups index: feed, discover join, your groups', async ({ page }, info) => {
  await page.goto('/groups?as=alex');
  await expect(page.getByRole('heading', { name: 'Recent activity' })).toBeVisible();
  await expect(page.getByTestId('post').first()).toBeVisible();
  await page.goto('/groups?tab=yours&as=alex');
  await expect(page.getByRole('heading', { name: /All groups you’ve joined \(\d+\)/ })).toBeVisible();
  await expect(page.getByTestId('group-card').filter({ hasText: 'Cheap Eats South Bay' })).toBeVisible();
  await page.goto('/groups?tab=discover&as=alex');
  const cards = page.getByTestId('group-card');
  await expect(cards.first()).toBeVisible();
  if (info.project.name === 'desktop') {
    const card = cards.filter({ hasText: 'K-Food' }).first();
    await card.getByRole('button', { name: /^Join / }).click();
    await expect(card.getByRole('link', { name: 'Visit group' })).toBeVisible();
    await card.getByRole('link', { name: 'Visit group' }).click();
    await expect(page.getByTestId('joined-group')).toBeVisible();
    await page.getByTestId('joined-group').click();
    await page.getByRole('menuitem', { name: 'Leave group' }).click();
    await expect(page.getByTestId('join-group')).toBeVisible();
  }
});

test('Notifications page: Unread filter, click marks read and opens the post', async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.goto('/notifications?as=alex');
  await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible();
  await expect(page.getByTestId('notification-row').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Unread' }).click();
  // post rows only: the seed also has Out Here rows (quest invites and joins) that open the map
  const unread = page.locator('[data-testid="notification-row"][data-unread="true"][data-href^="/posts/"]');
  const n = await unread.count();
  expect(n).toBeGreaterThan(0);
  // phone and desktop open different rows so both have one to open
  const row = unread.nth(info.project.name === 'phone' ? 0 : Math.min(1, n - 1));
  const href = await row.getAttribute('data-href');
  const id = await row.getAttribute('data-id');
  expect(href).toMatch(/^\/posts\//);
  await row.click();
  await expect(page).toHaveURL(new RegExp(href!.replace(/[?]/g, '\\?')));
  await expect(page.getByTestId('post-page')).toBeVisible();
  await expect(page.getByTestId('post').first()).toBeVisible();
  await page.goBack();
  await expect(page.locator(`[data-id="${id}"]`)).toHaveAttribute('data-unread', 'false');
  await page.getByRole('tab', { name: 'Unread' }).click();
  await expect(page.locator(`[data-testid="notification-row"][data-unread="true"][data-id="${id}"]`)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('every notification row links to a page that loads', async ({ page }) => {
  await page.goto('/notifications?as=alex');
  await expect(page.getByTestId('notification-row').first()).toBeVisible();
  const hrefs = [...new Set(await page.getByTestId('notification-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-href') ?? '')))];
  for (const href of hrefs.slice(0, 12)) {
    const res = await page.request.get(href);
    expect(res.status(), href).toBe(200);
  }
});

test('phone: bottom bar Notifications opens the list', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone only');
  await page.goto('/groups?as=alex');
  const tab = page.getByTestId('mtab-notifications');
  await expect(tab.getByTestId('count-badge')).toHaveText(/\d+/);
  await tab.click();
  await expect(page).toHaveURL(/\/notifications/);
  await expect(page.getByTestId('notification-row').first()).toBeVisible();
  // Opening the list clears the bottom-bar badge, as on Facebook.
  await expect(tab.getByTestId('count-badge')).toHaveCount(0);
});

test('group header: Share copies the group link', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop', 'clipboard permission is set on the desktop project');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/groups/cheap-eats-south-bay?as=alex');
  await page.getByTestId('share-group').click();
  await expect(page.getByText('Link copied to clipboard')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/groups\/cheap-eats-south-bay$/);
});

test('desktop: two personas — join a hangout, seats and the host bell update live', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop only (mutates the Taco truck crawl)');
  const sam = await personaPage(browser, 'sam', '/groups/cheap-eats-south-bay?tab=hangouts', false);
  const jordan = await personaPage(browser, 'jordan', '/groups/cheap-eats-south-bay?tab=hangouts', false);
  const samRow = hangout(sam, 'Taco truck crawl');
  const jordanRow = hangout(jordan, 'Taco truck crawl');
  await expect(samRow.getByTestId('seats-badge')).toHaveText(/\d+ left/);
  const before = Number((await samRow.getByTestId('seats-badge').textContent())!.match(/\d+/)![0]);

  // Sam opens the bell once so its badge starts from zero.
  const bell = sam.getByTestId('notifications-bell');
  await bell.click();
  await expect(sam.getByTestId('notifications-panel')).toBeVisible();
  await bell.click();
  await expect(bell.getByTestId('count-badge')).toHaveCount(0);

  // Sam's phone opens Notifications once, so its bottom-bar badge also starts from zero.
  const samPhone = await personaPage(browser, 'sam', '/notifications', true);
  await expect(samPhone.getByTestId('notification-row').first()).toBeVisible();
  await samPhone.getByTestId('mtab-groups').click();
  const phoneTab = samPhone.getByTestId('mtab-notifications');
  await expect(phoneTab.getByTestId('count-badge')).toHaveCount(0);

  await jordanRow.getByRole('button', { name: 'Join' }).click();
  await expect(jordanRow.getByRole('button', { name: 'Leave' })).toBeVisible();
  await expect(samRow.getByTestId('seats-badge')).toHaveText(`${before - 1} left`, { timeout: 5000 });
  await expect(bell.getByTestId('count-badge')).toHaveText(/1/, { timeout: 5000 });
  await expect(phoneTab.getByTestId('count-badge')).toHaveText(/1/, { timeout: 5000 });

  await bell.click();
  const row = sam.getByTestId('notifications-panel').getByTestId('notification-row').first();
  await expect(row).toContainText('Jordan');
  await expect(row).toHaveAttribute('data-href', /\/out-here\?quest=/);
  await expect(bell.getByTestId('count-badge')).toHaveCount(0);

  await jordanRow.getByRole('button', { name: 'Leave' }).click();
  await expect(samRow.getByTestId('seats-badge')).toHaveText(`${before} left`, { timeout: 5000 });
  await sam.context().close();
  await samPhone.context().close();
  await jordan.context().close();
});

test('desktop: bell popover lists notifications and See all opens the page', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop only');
  await page.goto('/?as=alex');
  await page.getByTestId('notifications-bell').click();
  const panel = page.getByTestId('notifications-panel');
  await expect(panel.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await expect(panel.getByTestId('notification-row').first()).toBeVisible();
  await panel.getByRole('link', { name: 'See all' }).click();
  await expect(page).toHaveURL(/\/notifications/);
  await expect(page.getByTestId('notifications-page')).toBeVisible();
});
