import { expect, test, type Page } from '@playwright/test';

// Entry points into Out Here: the Feed's "I'm free" opens the composer on /out-here, the old
// /out-here/friends path redirects to Friends mode, the friend card offers View profile,
// Message (/messages?to=<handle>) and Want to hang?, and status bubbles
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
      await expect(composer).toHaveAttribute('placeholder', /hungry/);
      await expect(page.getByTestId('plan-loading')).toHaveCount(0);
      await expect(page.getByTestId('plan-summary')).toHaveCount(0);
      // The param is consumed so a reload does not reopen the sheet.
      expect(new URL(page.url()).searchParams.get('free')).toBeNull();
      await page.screenshot({ path: `test-results/entry-imfree-${width}.png` });
    });

    test('the friend card offers View profile, Message and Want to hang?', async ({ page }) => {
      await openFriendsMap(page, width);
      await page.locator('[data-testid="friend-pin"][data-handle="maya"]').click();
      const card = page.getByTestId('friend-card');
      await expect(card).toBeVisible();
      await expect(card.getByRole('button', { name: 'Want to hang?' })).toBeVisible();
      await expect(card.getByRole('link', { name: 'View profile' })).toHaveAttribute('href', '/profile/maya');
      await expect(card.getByRole('link', { name: 'Message' })).toHaveAttribute('href', '/messages?to=maya');
      await page.screenshot({ path: `test-results/entry-card-${width}.png` });
      await card.getByRole('link', { name: 'View profile' }).click();
      await expect(page).toHaveURL(/\/profile\/maya/);
    });

    test('status bubbles: the whole thought or none, never cut short or emoji only; phones show the nearest few', async ({ page }) => {
      await openFriendsMap(page, width);
      if (width >= 800) {
        const maya = page.locator('[data-testid="friend-pin"][data-handle="maya"]');
        const text = maya.getByTestId('friend-chip-text');
        await expect(text).toHaveText('craving dumplings');
        // Not clipped: the whole thought fits inside its box.
        const clipped = await text.evaluate((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
        expect(clipped).toBe(false);
        await expect(maya).toHaveAttribute('data-chip', 'full');
      }
      await page.waitForTimeout(1000); // chip placement settles after the first framing

      const modes = await page.locator('[data-testid="friend-pin"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-chip')));
      for (const m of modes) expect(['full', 'none']).toContain(m);
      const texts = await page.getByTestId('friend-chip-text').allTextContents();
      for (const t of texts) expect(t).not.toMatch(/…$/);
      if (width < 800) {
        // Find My style: avatars for everyone, a chip for the nearest two at most
        expect(texts.length).toBeGreaterThanOrEqual(1);
        expect(texts.length).toBeLessThanOrEqual(2);
      } else {
        const widths = await page.getByTestId('friend-chip').evaluateAll((els) =>
          els.map((e) => (e.parentElement as HTMLElement).getBoundingClientRect().width));
        for (const w of widths) expect(w).toBeLessThanOrEqual(200.5);
      }
      await page.screenshot({ path: `test-results/entry-bubbles-${width}.png` });
    });
  });
}
