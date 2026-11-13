// Out Here navigation: the dashboard, return paths and dismissal (docs/UX_AUDIT.md).
// Each test checks both that the right view is active and that the previous one is gone.
import { expect, test, type Page } from '@playwright/test';

async function openMap(page: Page) {
  // Enter the way people do: from Facebook Home, through the Out Here tab.
  await page.goto('/?as=alex');
  await page.getByRole('link', { name: /out here/i }).first().click();
  await expect(page).toHaveURL(/\/out-here/);
  await expect(page.getByTestId('out-here-dock')).toBeVisible({ timeout: 20_000 });
}

/** Explore shows every plan's pin (Out Here opens on Friends). */
async function toExplore(page: Page) {
  await page.getByTestId('map-mode-explore').click();
  await expect(page.getByTestId('quest-pin-dumplings').first()).toBeVisible({ timeout: 20_000 });
}
const dock = (page: Page) => page.getByTestId('out-here-dock');

test.describe('Out Here navigation', () => {
  test('the dashboard: tabs, three heights, keyboard and Escape', async ({ page }) => {
    await openMap(page);
    const explore = dock(page).getByRole('button', { name: 'Explore', exact: true });
    const friends = dock(page).getByRole('button', { name: 'Friends', exact: true });
    // Out Here opens on Friends, the first tab; Explore is next.
    await expect(friends).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('out-here-map')).toHaveAttribute('data-mode', 'friends');
    const order = await dock(page).locator('nav button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    expect(order.slice(0, 3)).toEqual(['Friends', 'Explore', 'Plans']);
    await explore.click();
    await expect(explore).toHaveAttribute('aria-pressed', 'true');
    await expect(dock(page)).toHaveAttribute('data-level', '0');

    const handle = page.getByTestId('dock-handle');
    await handle.click();
    await expect(dock(page)).toHaveAttribute('data-level', '1');
    await expect(page.getByTestId('dock-quest').first()).toBeVisible();
    await handle.press('ArrowUp');
    await expect(dock(page)).toHaveAttribute('data-level', '2');
    await page.keyboard.press('Escape');
    await expect(dock(page)).toHaveAttribute('data-level', '0');
    await expect(handle).toBeFocused();
    await expect(page.getByTestId('dock-quest')).toHaveCount(0);

    // Friends switches the map layer; tapping it again opens the People list.
    await friends.click();
    await expect(friends).toHaveAttribute('aria-pressed', 'true');
    await expect(explore).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('out-here-map')).toHaveAttribute('data-mode', 'friends');
    await friends.click();
    await expect(page.getByTestId('people-row').first()).toBeVisible();

    // Plans opens Your plans inside Out Here: the page does not change.
    await page.getByTestId('out-here-dock').getByRole('button', { name: 'Plans', exact: true }).click();
    await expect(page.getByTestId('dock-plans')).toBeVisible();
    await expect(page).toHaveURL(/\/out-here/);
  });

  test('a plan card closes with X, Escape and browser Back without leaving Out Here', async ({ page }) => {
    await openMap(page);
    await toExplore(page);
    const card = page.getByTestId('quest-sheet');

    await page.getByTestId('quest-pin-dumplings').first().click();
    await expect(card).toBeVisible();
    await expect(page).toHaveURL(/quest=/);
    await page.goBack();
    await expect(card).toHaveCount(0);
    await expect(page).toHaveURL(/\/out-here(?!.*quest=)/);

    await page.getByTestId('quest-pin-dumplings').first().click();
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Close' }).click();
    await expect(card).toHaveCount(0);
    await expect(page).toHaveURL(/\/out-here(?!.*quest=)/);

    await page.getByTestId('quest-pin-dumplings').first().click();
    await expect(card).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    await expect(page.getByTestId('out-here-dock')).toBeVisible();
  });

  test("I'm free and Post close with Escape; a typed draft is kept", async ({ page }) => {
    await openMap(page);
    await toExplore(page);
    await page.getByTestId('im-free').click();
    await expect(page.getByTestId('plan-sheet')).toBeVisible();
    await expect(dock(page)).toHaveCount(0); // one panel at a time
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('plan-sheet')).toHaveCount(0);
    await expect(page.getByTestId('im-free')).toBeFocused();

    await page.getByTestId('create-plan-btn').click();
    await expect(page.getByTestId('create-plan-sheet')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('create-plan-sheet')).toHaveCount(0);

    await page.getByTestId('create-plan-btn').click();
    await page.keyboard.type('pho with someone');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('create-plan-sheet')).toBeVisible();
    await page.getByTestId('create-plan-sheet').getByRole('button', { name: 'Close' }).first().click();
    await expect(page.getByTestId('create-plan-sheet')).toHaveCount(0);
  });

  test('Memories and the plan page lead back to the map', async ({ page }) => {
    await openMap(page);
    await toExplore(page);
    await page.getByRole('link', { name: 'Memories' }).click();
    await expect(page).toHaveURL(/\/memories/);
    await page.getByRole('link', { name: 'Back to the map' }).click();
    await expect(page).toHaveURL(/\/out-here/);
    await expect(page.getByTestId('out-here-dock')).toBeVisible();

    await page.getByTestId('quest-pin-dumplings').first().click();
    await page.getByTestId('quest-open-page').click();
    await expect(page).toHaveURL(/\/out-here\/plan\//);
    await page.getByTestId('plan-page-back').click();
    await expect(page.getByTestId('quest-sheet')).toBeVisible();
  });
});
