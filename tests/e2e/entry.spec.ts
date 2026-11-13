import { expect, test, type Page } from '@playwright/test';

// Entry points into Out Here: the Feed's "I'm free" opens the composer on /out-here, the old
// /out-here/friends path redirects to Friends mode, the friend card offers View profile and
// Want to hang? (Message stays hidden until Messenger opens threads from ?to=), and status bubbles
// show the full thought on desktop and a short form (never emoji alone) on phones, where a
// colliding chip moves below its avatar or shortens instead of hiding. Runs at 390 (phone project) and 1440 (desktop project).

async function openFriendsMap(page: Page, width: number) {
  await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
  await page.goto('/out-here/friends?as=alex');
  await expect(page).toHaveURL(/\/out-here\?(.*&)?mode=friends/);
  expect(new URL(page.url()).searchParams.get('as')).toBe('alex');
  const map = page.getByTestId('out-here-map');
  await expect(map).toBeVisible();
  // ?mode=friends alone must open Friends mode; the test never clicks the toggle.
  await expect(map).toHaveAttribute('data-mode', 'friends');
  await expect(page.getByTestId('map-mode-friends')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-testid="friend-pin"][data-handle="maya"]')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1200);
}

for (const width of [390, 1440]) {
  test.describe(`at ${width}px`, () => {
    test.beforeEach(({}, info) => {
      test.skip((width === 390) !== (info.project.name === 'phone'), 'one width per project');
    });

    test("Feed I'm free opens the composer on /out-here, focused and empty", async ({ page }) => {
      await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
      await page.goto('/?as=alex');
      const button = page.getByTestId('home-outhere-free-button');
      await expect(button).toHaveAttribute('href', '/out-here?free=1');
      await button.click();
      await expect(page).toHaveURL(/\/out-here/);
      await expect(page.getByTestId('plan-sheet')).toBeVisible({ timeout: 15_000 });
      const composer = page.locator('#imfree-text');
      await expect(composer).toBeFocused();
      await expect(composer).toHaveValue('');
      await expect(composer).toHaveAttribute('placeholder', /Anything else/);
      await expect(page.getByTestId('plan-loading')).toHaveCount(0);
      await expect(page.getByTestId('plan-summary')).toHaveCount(0);
      // The param is consumed so a reload does not reopen the sheet.
      expect(new URL(page.url()).searchParams.get('free')).toBeNull();
      await page.screenshot({ path: `test-results/entry-imfree-${width}.png` });
    });

    test('the friend card offers View profile and Want to hang?, and no dead Message link', async ({ page }) => {
      await openFriendsMap(page, width);
      await page.locator('[data-testid="friend-pin"][data-handle="maya"]').click();
      const card = page.getByTestId('friend-card');
      await expect(card).toBeVisible();
      await expect(card.getByRole('button', { name: 'Want to hang?' })).toBeVisible();
      await expect(card.getByRole('link', { name: 'View profile' })).toHaveAttribute('href', '/profile/maya');
      await expect(card.getByRole('link', { name: 'Message' })).toHaveCount(0);
      await page.screenshot({ path: `test-results/entry-card-${width}.png` });
      await card.getByRole('link', { name: 'View profile' }).click();
      await expect(page).toHaveURL(/\/profile\/maya/);
    });

    test('status bubbles: full thought on desktop, short text on phones, never emoji only', async ({ page }) => {
      await openFriendsMap(page, width);
      const maya = page.locator('[data-testid="friend-pin"][data-handle="maya"]');
      const text = maya.getByTestId('friend-chip-text');
      // The status shows on hover where there is one (desktop); on phones a tap opens the card.
      if (width > 800) {
        await maya.hover();
        await expect(text).toBeVisible();
      }
      await expect(text).toHaveText('free after class');
      // Not clipped: the whole thought fits inside its box.
      const clipped = await text.evaluate((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
      expect(clipped).toBe(false);
      await expect(maya).toHaveAttribute('data-chip', width < 800 ? 'short' : 'full');

      const modes = await page.locator('[data-testid="friend-pin"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-chip')));
      expect(modes).not.toContain('emoji');
      if (width < 800) {
        expect(modes).not.toContain('full');
        const texts = await page.getByTestId('friend-chip-text').allTextContents();
        for (const t of texts) expect(t.length).toBeLessThanOrEqual(19);
        // Crowded phone maps move or shorten chips instead of hiding them.
        expect(texts.length).toBeGreaterThanOrEqual(5);
      } else {
        const widths = await page.getByTestId('friend-chip').evaluateAll((els) =>
          els.map((e) => (e.parentElement as HTMLElement).getBoundingClientRect().width));
        for (const w of widths) expect(w).toBeLessThanOrEqual(200.5);
      }
      await page.screenshot({ path: `test-results/entry-bubbles-${width}.png` });
    });
  });
}
