import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

// Shell smoke test at 1440 (desktop project) and 390 (phone project) widths.

const PERSONAS = ['Alex Rivera', 'Maya Chen', 'Jordan Brooks', 'Priya Natarajan', 'Sam Okafor', 'Leo Marchetti', 'Nina Park', 'Kai Nakamura'];

const ROUTES = [
  '/',
  '/friends',
  '/out-here',
  '/groups',
  '/groups/cheap-eats-south-bay',
  '/marketplace',
  '/events',
  '/messages',
  '/notifications',
  '/profile/alex',
  '/search?q=dumplings',
  '/saved',
  '/menu',
];

/** Collects console errors and uncaught page errors for the whole test. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    // Seed images live in public/seed, which is not tracked in git; a checkout without them
    // 404s on avatars (the Avatar falls back to initials). Anything else is a real error.
    if (msg.text().startsWith('Failed to load resource') && msg.location().url.includes('/seed/')) return;
    errors.push(`${msg.text()} @ ${msg.location().url}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

test.describe('desktop 1440', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop project only');
  });

  test('top bar, left nav and right rail render', async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('top-bar')).toBeVisible();
    await expect(page.getByTestId('wordmark')).toBeVisible();
    await expect(page.getByRole('search')).toBeVisible();
    await expect(page.getByTestId('center-tabs')).toBeVisible();
    await expect(page.getByTestId('left-nav')).toBeVisible();
    await expect(page.getByTestId('right-rail')).toBeVisible();
    await expect(page.getByTestId('mobile-tab-bar')).toBeHidden();
    await expect(page.getByTestId('brand-footer')).toBeVisible();
    await expect(page.getByTestId('brand-footer')).toContainText('Fictional people');
    await expect(page.getByTestId('right-rail').getByRole('heading', { name: 'Contacts' })).toBeVisible();
    await expect(page.getByTestId('contacts-list').getByRole('link').first()).toBeVisible();
    await expect(page.getByTestId('online-dot').first()).toBeVisible();
    await expect(page.getByTestId('tab-out-here')).toContainText('Out Here');
    await expect(page.getByRole('link', { name: 'Notifications' }).getByTestId('count-badge')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('every center tab navigates to its route', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/notifications');
    const tabs: [string, string][] = [
      ['home', '/'],
      ['friends', '/friends'],
      ['out-here', '/out-here'],
      ['groups', '/groups'],
      ['marketplace', '/marketplace'],
    ];
    for (const [id, path] of tabs) {
      await page.getByTestId(`tab-${id}`).click();
      await expect(page).toHaveURL((u) => u.pathname === path);
      await expect(page.getByTestId(`tab-${id}`)).toHaveAttribute('aria-current', 'page');
    }
    await page.getByRole('link', { name: 'Messenger' }).first().click();
    await expect(page).toHaveURL(/\/messages$/);
    await page.getByRole('link', { name: 'Notifications' }).first().click();
    await expect(page).toHaveURL(/\/notifications$/);
    await page.getByRole('search').getByRole('searchbox').fill('dumplings');
    await page.getByRole('search').getByRole('searchbox').press('Enter');
    await expect(page).toHaveURL(/\/search\?q=dumplings$/);
    await expect(page.getByRole('heading', { name: 'Search results' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('left nav and menu grid links navigate', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    const nav = page.getByTestId('left-nav').getByRole('navigation', { name: 'Shortcuts' });
    await nav.getByRole('link', { name: 'Events' }).click();
    await expect(page).toHaveURL(/\/events$/);
    await nav.getByRole('link', { name: 'Saved' }).click();
    await expect(page).toHaveURL(/\/saved$/);
    await nav.getByRole('button', { name: 'See more' }).click();
    await nav.getByRole('link', { name: 'Messenger' }).click();
    await expect(page).toHaveURL(/\/messages$/);

    await page.goto('/');
    const shortcut = page.getByRole('navigation', { name: 'Your shortcuts' }).getByRole('link').first();
    await shortcut.click();
    await expect(page).toHaveURL(/\/groups\/[a-z0-9-]+$/);

    await page.getByTestId('menu-grid-button').click();
    const menu = page.getByRole('menu', { name: 'Menu' });
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: /Marketplace/ }).click();
    await expect(page).toHaveURL(/\/marketplace$/);
    await expect(menu).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('avatar menu lists the 8 personas and switches persona', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await page.getByTestId('account-button').click();
    const list = page.getByTestId('persona-list');
    await expect(list.getByRole('menuitem')).toHaveCount(8);
    for (const name of PERSONAS) await expect(list.getByRole('menuitem', { name: new RegExp(name) })).toBeVisible();
    await list.getByRole('menuitem', { name: /Maya Chen/ }).click();
    await expect(page).toHaveURL(/[?&]as=maya/);
    await expect(page.getByTestId('account-button')).toHaveAttribute('aria-label', 'Account: Maya Chen');
    expect(await page.evaluate(() => sessionStorage.getItem('outhere.persona'))).toBe('maya');
    // the persona sticks for this tab after navigating without ?as=
    await page.getByTestId('tab-friends').click();
    await expect(page.getByTestId('account-button')).toHaveAttribute('aria-label', 'Account: Maya Chen');
    await page.reload();
    await expect(page.getByTestId('account-button')).toHaveAttribute('aria-label', 'Account: Maya Chen');
    expect(errors).toEqual([]);
  });

  test('about-this-demo dialog opens and closes', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('brand-footer').getByRole('button', { name: 'About this demo' }).click();
    const dialog = page.getByRole('dialog', { name: 'About this demo' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('every shell route renders with no console errors', async ({ page }) => {
    const errors = watchErrors(page);
    for (const path of ROUTES) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByTestId('top-bar')).toBeVisible();
      await expect(page.locator('main#main')).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
});

test.describe('mobile 390', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'phone project only');
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('top bar and bottom tab bar render; rails are hidden', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await expect(page.getByTestId('top-bar')).toBeVisible();
    await expect(page.getByTestId('wordmark')).toBeVisible();
    await expect(page.getByTestId('mobile-tab-bar')).toBeVisible();
    await expect(page.getByTestId('center-tabs')).toBeHidden();
    await expect(page.getByTestId('left-nav')).toBeHidden();
    await expect(page.getByTestId('right-rail')).toBeHidden();
    // Notifications moves from the top bar to the bottom tab bar
    await expect(page.getByTestId('top-bar').getByRole('link', { name: 'Notifications' })).toBeHidden();
    await expect(page.getByTestId('mtab-notifications').getByTestId('count-badge')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test('every bottom tab navigates to its route', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    const tabs: [string, string][] = [
      ['out-here', '/out-here'],
      ['friends', '/friends'],
      ['groups', '/groups'],
      ['notifications', '/notifications'],
      ['menu', '/menu'],
      ['home', '/'],
    ];
    for (const [id, path] of tabs) {
      await page.getByTestId(`mtab-${id}`).click();
      await expect(page).toHaveURL((u) => u.pathname === path);
      await expect(page.getByTestId(`mtab-${id}`)).toHaveAttribute('aria-current', 'page');
    }
    await page.getByRole('link', { name: 'Search' }).click();
    await expect(page).toHaveURL(/\/search$/);
    await page.getByRole('link', { name: 'Messenger' }).click();
    await expect(page).toHaveURL(/\/messages$/);
    expect(errors).toEqual([]);
  });

  test('avatar menu lists the 8 personas', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await page.getByTestId('account-button').click();
    const list = page.getByTestId('persona-list');
    await expect(list.getByRole('menuitem')).toHaveCount(8);
    for (const name of PERSONAS) await expect(list.getByRole('menuitem', { name: new RegExp(name) })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('menu page shows destinations and the brand footer', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/menu');
    await expect(page.getByRole('heading', { name: 'Menu' })).toBeVisible();
    const footer = page.locator('main#main').getByTestId('brand-footer');
    await expect(footer).toBeVisible();
    await expect(footer).toContainText('Not affiliated with Meta');
    await page.getByRole('navigation', { name: 'Shortcuts' }).getByRole('link', { name: 'Events' }).click();
    await expect(page).toHaveURL(/\/events$/);
    expect(errors).toEqual([]);
  });
});
