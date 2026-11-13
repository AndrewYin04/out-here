import { expect, test, type Page } from '@playwright/test';

// The "✨ Muse filter" chip on the Out Here map (MUSE_MOCK run): on, the map keeps only the plans
// or friends Muse picked and says how many; "Show all" turns it off; "on" survives a reload in
// the same tab. Runs on both projects (phone 390 px, desktop 1440 px).

type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const questPins = (page: Page) => page.locator('[data-map-marker="quest"]');

async function openMap(page: Page, extra = '') {
  await page.goto(`/out-here?as=alex${extra}`);
  await expect(page.getByTestId('out-here-map')).toBeVisible();
  await expect.poll(() => questPins(page).count(), { timeout: 20_000 }).toBeGreaterThan(5);
}

test.describe('Muse filter', () => {
  test.beforeEach(async ({ page }, info) => {
    await page.setViewportSize(info.project.name === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  });

  test('toggle filters quest pins, Show all brings them back, reload keeps it on', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openMap(page);
    const all = await questPins(page).count();

    const toggle = page.getByTestId('muse-filter-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    const viewport = page.viewportSize()!;
    const tb = (await toggle.boundingBox())!;
    expect(tb.x).toBeGreaterThanOrEqual(0);
    expect(tb.x + tb.width).toBeLessThanOrEqual(viewport.width);
    const modes = (await page.getByTestId('map-mode-friends').boundingBox())!;
    expect(overlap(tb, modes)).toBe(false);
    const zoomCtl = page.locator('.maplibregl-ctrl-top-right');
    if (await zoomCtl.isVisible()) expect(overlap(tb, (await zoomCtl.boundingBox())!)).toBe(false);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const status = page.getByTestId('muse-filter-status');
    await expect(status).toContainText(/Muse is showing \d+ of \d+ plans/, { timeout: 15_000 });
    await expect.poll(() => questPins(page).count()).toBeLessThan(all);
    const kept = await questPins(page).count();
    expect(kept).toBeGreaterThan(0);
    await expect(status).toContainText(`showing ${kept} of ${all} plans`);
    await expect(page.getByTestId('quest-pin-dumplings')).toHaveCount(1);
    const sb = (await status.boundingBox())!;
    expect(overlap(sb, tb)).toBe(false);
    expect(sb.x + sb.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: `test-results/musefilter-${viewport.width}.png` });

    await page.reload();
    await expect(page.getByTestId('muse-filter-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('muse-filter-status')).toContainText(`showing ${kept} of`, { timeout: 15_000 });
    await expect.poll(() => questPins(page).count()).toBe(kept);

    await page.getByTestId('muse-filter-show-all').click();
    await expect(page.getByTestId('muse-filter-status')).toHaveCount(0);
    await expect(page.getByTestId('muse-filter-toggle')).toHaveAttribute('aria-pressed', 'false');
    // at least every pin from before: the other project's specs may add a plan meanwhile
    await expect.poll(() => questPins(page).count()).toBeGreaterThanOrEqual(all);
    expect(errors).toEqual([]);
  });

  test('kept plans fit on screen, reasons show in the list and on the quest sheet', async ({ page }) => {
    await openMap(page);
    await page.getByTestId('muse-filter-toggle').click();
    const status = page.getByTestId('muse-filter-status');
    await expect(status).toContainText(/Muse is showing \d+ of \d+ plans/, { timeout: 15_000 });
    // The camera refits to the kept pins: every one is inside the map after the 600 ms ease.
    const mapBox = (await page.getByTestId('out-here-map').boundingBox())!;
    await expect.poll(async () => {
      const boxes = await questPins(page).evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }));
      return boxes.every((b) => b.x >= mapBox.x && b.y >= mapBox.y && b.x + b.width <= mapBox.x + mapBox.width && b.y + b.height <= mapBox.y + mapBox.height);
    }, { timeout: 5_000 }).toBe(true);

    await page.getByTestId('muse-filter-why').click();
    const items = page.getByTestId('muse-filter-reason-item');
    await expect(items.first()).toBeVisible();
    await expect(page.getByTestId('muse-filter-reasons')).toContainText('dumplings');
    await expect(page.getByTestId('muse-filter-reasons')).toContainText(/\d+ min walk/);
    await page.screenshot({ path: `test-results/musefilter-why-${page.viewportSize()!.width}.png` });
    await page.getByTestId('muse-filter-why').click();

    await page.getByTestId('quest-pin-dumplings').click();
    await expect(page.getByTestId('quest-muse-reason')).toContainText(/dumplings/, { timeout: 10_000 });
    await page.screenshot({ path: `test-results/musefilter-sheet-${page.viewportSize()!.width}.png` });
  });

  test('Maya: the filter never empties her map', async ({ page }) => {
    await page.goto('/out-here?as=maya');
    await expect.poll(() => questPins(page).count(), { timeout: 20_000 }).toBeGreaterThan(3);
    await page.getByTestId('muse-filter-toggle').click();
    const status = page.getByTestId('muse-filter-status');
    await expect(status).toContainText(/Muse is showing \d+ of \d+ plans|closest plans/, { timeout: 15_000 });
    await expect(status).not.toContainText('Nothing matches right now');
    await expect.poll(() => questPins(page).count()).toBeGreaterThan(0);
    await page.screenshot({ path: `test-results/musefilter-maya-${page.viewportSize()!.width}.png` });
  });

  test('Friends view with the filter on shows Maya', async ({ page }) => {
    await openMap(page, '&mode=friends');
    await expect(page.getByTestId('out-here-map')).toHaveAttribute('data-mode', 'friends');
    await expect.poll(() => page.locator('[data-testid="friend-pin"], [data-testid="friend-cluster"]').count(), { timeout: 15_000 }).toBeGreaterThan(0);
    await page.getByTestId('muse-filter-toggle').click();
    const status = page.getByTestId('muse-filter-status');
    await expect(status).toContainText(/Muse is showing 1 of \d+ friends/, { timeout: 15_000 });
    await expect(page.getByTestId('friend-pin')).toHaveCount(1);
    await expect(page.locator('[data-testid="friend-pin"][data-handle="maya"]')).toHaveCount(1);
    await page.screenshot({ path: `test-results/musefilter-friends-${page.viewportSize()!.width}.png` });
    await page.locator('[data-testid="friend-pin"][data-handle="maya"]').click();
    await expect(page.getByTestId('friend-muse-reason')).toContainText(/Maya: you both like/);
    await page.screenshot({ path: `test-results/musefilter-friend-card-${page.viewportSize()!.width}.png` });
    await page.getByRole('button', { name: 'Close' }).first().click();
    await expect(page.getByTestId('friend-card')).toHaveCount(0);
    await page.getByTestId('muse-filter-show-all').click();
    const friendMarkers = page.locator('[data-testid="friend-pin"], [data-testid="friend-cluster"]');
    await expect.poll(() => friendMarkers.count()).toBeGreaterThan(1);
  });
});
