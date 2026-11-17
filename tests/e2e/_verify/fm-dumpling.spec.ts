import { expect, test } from '@playwright/test';

for (const [width, mode] of [[1440, 'friends'], [390, 'explore'], [390, 'friends']] as const) {
  test('Dumpling Den tap at ' + width + ' in ' + mode, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 900 }, isMobile: width < 800, hasTouch: width < 800 });
    const page = await ctx.newPage();
    await page.goto('/out-here?mode=' + mode + '&as=alex');
    await expect(page.getByTestId('out-here-map')).toHaveAttribute('data-mode', mode, { timeout: 20_000 });
    const pin = page.getByTestId('quest-pin-dumplings');
    await expect(pin).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    const box = await pin.boundingBox();
    const cx = box!.x + box!.width / 2, cy = box!.y + box!.height / 2;
    const tid = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); const t = e ? e.closest('[data-testid]') : null; return t ? t.getAttribute('data-testid') : null; }, [cx, cy]);
    if (width < 800) await page.touchscreen.tap(cx, cy); else await page.mouse.click(cx, cy);
    await page.waitForTimeout(1200);
    const dialogs = await page.getByRole('dialog').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || (e.textContent || '').slice(0, 40)));
    console.log(width, mode, 'top element:', tid, 'dialogs after tap:', JSON.stringify(dialogs));
    await page.screenshot({ path: 'test-results/verify-dumpling-' + width + '-' + mode + '.png' });
    await ctx.close();
  });
}
