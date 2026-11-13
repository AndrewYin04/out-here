import { expect, test, type Browser, type Page } from '@playwright/test';

// Demo beat 3, "the thrift pop-up goes live" (docs/DEMO_GUIDE.md): Leo opens the Campus Thrift
// Pop-Up from /out-here?sell=popup, the pins reach Alex's map live, Alex opens the $20 track
// jacket from Muse's find, reserves it, Leo accepts, Alex gets the hold timer and only then the
// exact pickup spot. Maya gets the denim bag as a find from the denim Reel she saved.
//
// Three personas in their own browser contexts (?as= per tab). Alex and Maya each also have a
// 390 px tab next to the 1440 px one, so every state is screenshotted at both widths.
// SHOTS=<dir> saves the screenshots there (default test-results/market-shots).

const SHOTS = process.env.SHOTS || 'test-results/market-shots';
const SPOT = 'Folding tables by the bike racks';

async function open(browser: Browser, handle: string, width: number, query: string): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 800 ? 844 : 900 },
    ...(width < 800 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
  });
  const page = await ctx.newPage();
  await page.goto(`/out-here?as=${handle}&view=map${query}`);
  await expect(page.getByTestId('out-here-map')).toHaveAttribute('data-view', 'map', { timeout: 45_000 });
  return page;
}

const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` });

/** The listing id of a pin whose aria-label starts with `title`. */
async function pinId(page: Page, title: RegExp): Promise<string> {
  const pin = page.locator('button[data-testid^="listing-pin-"]').and(page.getByRole('button', { name: title }));
  await expect(pin.first()).toBeVisible({ timeout: 15_000 });
  return (await pin.first().getAttribute('data-testid'))!.replace('listing-pin-', '');
}

test.describe.configure({ mode: 'serial' });

test('beat 3: pop-up goes live, Alex reserves the jacket, Leo accepts, Maya gets the denim find', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'one run with its own 390 and 1440 contexts');
  test.setTimeout(240_000);

  const leo = await open(browser, 'leo', 1440, '&sell=popup');
  const leoPhone = await open(browser, 'leo', 390, '&sell=popup');
  const alex = await open(browser, 'alex', 1440, '&mode=explore');
  const alexPhone = await open(browser, 'alex', 390, '&mode=explore');
  const maya = await open(browser, 'maya', 390, '&mode=explore');
  const mayaDesk = await open(browser, 'maya', 1440, '&mode=explore');
  // Maya's phone as in the demo: the Friends map (the default mode). This tab's map misses the
  // pop-up: every /api/listings/map read sent before Muse's pick for the bag reaches it answers
  // with the pre-pop-up listings, as when a listings:new frame is dropped. The pick is held 2 s,
  // so the reads the listings:new burst starts all get the stale answer. The find must still
  // appear without a reload, because a pick that isn't on the map makes the map refetch.
  const mayaFriends = await open(browser, 'maya', 390, '');
  await expect(mayaFriends.getByTestId('out-here-map')).toHaveAttribute('data-mode', 'friends');
  let stale: string | null = null;
  let pickSeen = false;
  await mayaFriends.route('**/api/muse/marketplace-picks**', async (route) => {
    const res = await route.fetch();
    const body = await res.text();
    if (!pickSeen && /Y2K denim shoulder bag/.test(body)) {
      await new Promise((r) => setTimeout(r, 2000));
      pickSeen = true;
    }
    return route.fulfill({ response: res, body });
  });
  await mayaFriends.route('**/api/listings/map', async (route) => {
    if (pickSeen || stale === null) return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: stale });
  });
  stale = await (await mayaFriends.request.get('/api/listings/map', { headers: { 'x-persona': 'maya' } })).text();

  // 1. The seller's tab opens on the pop-up, items filled in.
  const sheet = leo.getByTestId('popup-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Campus Thrift Pop-Up');
  await expect(sheet).toContainText('Vintage track jacket');
  await expect(sheet).toContainText('$20');
  await expect(sheet).toContainText('Y2K denim shoulder bag');
  await expect(leoPhone.getByTestId('popup-sheet')).toBeVisible();
  await shot(leo, 'sell-sheet-1440');
  await shot(leoPhone, 'sell-sheet-390');
  await leoPhone.close();

  // Before the pop-up opens, nobody has a jacket pin.
  await expect(alex.getByRole('button', { name: /Vintage track jacket/ })).toHaveCount(0);
  await leo.getByTestId('popup-open').click();
  await expect(leo.getByTestId('popup-sheet')).toHaveCount(0);
  // The seller lands on the jacket's sheet, exact spot shown (it's theirs).
  const leoListing = leo.getByTestId('listing-sheet');
  await expect(leoListing).toContainText('Vintage track jacket');
  await expect(leoListing).toContainText(SPOT);
  await expect(leoListing).toContainText('No requests yet');

  // 2. Alex's map gets both pins live (realtime, no reload).
  const jacketId = await pinId(alex, /^Vintage track jacket, \$20/);
  await expect(alex.getByRole('button', { name: /^Y2K denim shoulder bag/ })).toBeVisible();
  await expect(alexPhone.getByRole('button', { name: /^Vintage track jacket/ })).toBeVisible({ timeout: 15_000 });

  // Muse's find for Alex: the jacket, because of the watch he set (track jacket under $25).
  const find = alex.getByTestId('muse-find');
  await expect(find).toBeVisible({ timeout: 20_000 });
  await expect(find).toContainText('Vintage track jacket');
  await expect(alex.getByTestId('muse-find-watch')).toContainText(/track jacket under \$25/i);
  await expect(alex.getByTestId('muse-find-line')).toContainText(/walk/);
  await expect(alex.getByTestId('muse-find-line')).not.toContainText(/drive/);
  await expect(alexPhone.getByTestId('muse-find')).toBeVisible({ timeout: 20_000 });
  await shot(alex, 'map-pins-find-1440');
  await shot(alexPhone, 'map-pins-find-390');

  // 3. View → the listing sheet with Muse's line, fuzzed pickup area only.
  await find.getByTestId('muse-find-view').click();
  const listing = alex.getByTestId('listing-sheet');
  await expect(listing).toHaveAttribute('data-status', 'available');
  await expect(listing).toContainText('$20');
  await expect(alex.getByTestId('listing-muse-line')).toContainText(/track jacket under \$25/i);
  await expect(listing).toContainText(/min walk/);
  await expect(listing).not.toContainText(SPOT);
  await alexPhone.getByTestId('muse-find').getByTestId('muse-find-view').click();
  await expect(alexPhone.getByTestId('listing-sheet')).toHaveAttribute('data-status', 'available');
  await shot(alex, 'listing-sheet-1440');
  await shot(alexPhone, 'listing-sheet-390');

  // The API agrees: no exact spot for a buyer before acceptance.
  const before = await (await alex.request.get(`/api/listings/${jacketId}/pickup`, { headers: { 'x-persona': 'alex' } })).json();
  expect(before.listing.exact).toBe(false);
  expect(before.listing.listing.pickupSpot).toBeNull();

  await listing.getByTestId('reserve-btn').click();
  await expect(alex.getByTestId('reserve-form')).toBeVisible();
  await alexPhone.getByTestId('reserve-btn').click();
  await expect(alexPhone.getByTestId('reserve-form')).toBeVisible();
  await shot(alex, 'reserve-form-1440');
  await shot(alexPhone, 'reserve-form-390');
  await alexPhone.getByTestId('reserve-form').getByRole('button', { name: 'Cancel' }).click();

  await alex.getByTestId('reserve-send').click();
  await expect(alex.getByTestId('hold-requested')).toBeVisible();
  // Muse's reason stays the one Alex read; it doesn't swap to another find's line.
  await expect(alex.getByTestId('listing-muse-line')).toContainText(/track jacket under \$25/i);
  await expect(listing).not.toContainText(SPOT);
  await expect(alexPhone.getByTestId('hold-requested')).toBeVisible({ timeout: 10_000 });
  await shot(alex, 'reserve-requested-1440');
  await shot(alexPhone, 'reserve-requested-390');

  // 4. Leo's open sheet shows the request live, and he accepts.
  const req = leo.getByTestId('seller-requests');
  await expect(req).toContainText('Alex', { timeout: 10_000 });
  await shot(leo, 'seller-request-1440');
  await req.getByTestId('accept-hold').click();
  await expect(leo.getByTestId('seller-held')).toContainText('Held for Alex');

  // 5. Alex: Reserved + the hold timer, and now the exact spot.
  await expect(alex.getByTestId('hold-accepted')).toBeVisible({ timeout: 10_000 });
  await expect(listing).toHaveAttribute('data-status', 'reserved');
  await expect(alex.getByTestId('hold-countdown')).toHaveText(/\d+ min/);
  await expect(listing).toContainText(/Reserved · \d+ min/);
  await expect(listing).toContainText(SPOT);
  await expect(alexPhone.getByTestId('hold-accepted')).toBeVisible({ timeout: 10_000 });
  await shot(alex, 'reserve-accepted-1440');
  await shot(alexPhone, 'reserve-accepted-390');
  const after = await (await alex.request.get(`/api/listings/${jacketId}/pickup`, { headers: { 'x-persona': 'alex' } })).json();
  expect(after.listing.exact).toBe(true);
  expect(after.listing.listing.pickupSpot).toContain(SPOT);
  // Maya still gets only the fuzzed area for the jacket.
  const other = await (await maya.request.get(`/api/listings/${jacketId}/pickup`, { headers: { 'x-persona': 'maya' } })).json();
  expect(other.listing.exact).toBe(false);
  expect(other.listing.listing.pickupSpot).toBeNull();

  // 6. Maya: the denim bag, tied to the denim Reel she saved.
  for (const [p, w] of [[maya, 390], [mayaDesk, 1440]] as const) {
    const f = p.getByTestId('muse-find');
    await expect(f).toBeVisible({ timeout: 20_000 });
    await expect(f).toContainText('Y2K denim shoulder bag');
    await expect(p.getByTestId('muse-find-line')).toContainText(/denim/i);
    await expect(p.getByTestId('muse-find-line')).toContainText(/Reel|watched/i);
    await shot(p, `maya-denim-find-${w}`);
  }
  // Maya's Friends-map phone missed the listings:new refetch; the pick brings the bag in anyway.
  expect(pickSeen).toBe(true);
  const ff = mayaFriends.getByTestId('muse-find');
  await expect(ff).toBeVisible({ timeout: 20_000 });
  await expect(ff).toContainText('Y2K denim shoulder bag');
  await shot(mayaFriends, 'maya-denim-find-friends-390');
});
