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
    await expect.poll(() => questPins(page).count()).toBe(all);
    expect(errors).toEqual([]);
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
    await page.getByTestId('muse-filter-show-all').click();
    const friendMarkers = page.locator('[data-testid="friend-pin"], [data-testid="friend-cluster"]');
    await expect.poll(() => friendMarkers.count()).toBeGreaterThan(1);
  });
});
