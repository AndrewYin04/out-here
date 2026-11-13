import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { seedId } from '../../src/shared/seed/ids';

// Out Here map: pins, quest sheet, live seats across two personas, deep link, and the
// no-WebGL and no-tiles fallbacks. Phone checks run at 390 px, desktop at 1440 px.
// Server state is shared, so each project mutates its own quest (never the dumpling quest,
// which api.spec.ts uses) and puts it back afterwards.

const DUMPLINGS = seedId('quest', 'dumplings');
/** Reporting hides a plan for the reporter (event-creation branch), so the Report check uses a
 *  plan no other spec depends on; reporting Dumpling Den would hide it from every later test. */
const ART_WALK = seedId('quest', 'art-walk');

type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function openMap(page: Page, persona: string, extra = '') {
  await page.goto(`/out-here?as=${persona}${extra.includes('mode=') ? '' : '&mode=explore'}${extra}`);
  await expect(page.getByTestId('out-here-map')).toBeVisible();
}

async function badgeSeats(pin: Locator): Promise<number> {
  const text = (await pin.getAttribute('aria-label')) ?? '';
  const m = text.match(/(\d+) left/);
  return m ? Number(m[1]) : 0;
}

async function newPersonaPage(browser: Browser, persona: string, viewport: { width: number; height: number }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await openMap(page, persona);
  return page;
}

test.describe('phone 390', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.beforeEach(({}, info) => {
    test.skip(!info.project.name.startsWith('phone'), 'phone project only');
  });

  test('dumpling pin is clear of other markers and the sheet keeps attribution visible', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openMap(page, 'alex');
    const pin = page.getByTestId('quest-pin-dumplings');
    await expect(pin).toBeVisible();
    await expect(pin).toHaveAttribute('aria-label', /Dumplings before the rush, starts (in \d+ min|.*[AP]M)|happening now/);
    await expect(pin).toHaveAttribute('aria-label', /\d+ left/);
    await page.waitForTimeout(500); // let the clustering pass settle
    // Pins carry a "title · time" label, and no leader lines are drawn.
    await expect(page.locator('[data-role="pin-label"]').filter({ visible: true }).first()).toHaveText(/ · (in \d+ min|Now|\d+:\d\d [AP]M)$/);

    const mine = (await pin.boundingBox())!;
    const markers = page.locator('[data-map-marker]');
    const n = await markers.count();
    expect(n).toBeGreaterThan(5);
    for (let i = 0; i < n; i++) {
      const m = markers.nth(i);
      if ((await m.getAttribute('data-testid')) === 'quest-pin-dumplings') continue;
      const box = await m.boundingBox();
      if (box) expect(overlap(mine, box), `dumpling pin overlaps marker ${i}`).toBe(false);
    }

    await pin.click();
    const sheet = page.getByTestId('quest-sheet');
    await expect(sheet.getByRole('heading', { name: 'Dumplings before the rush' })).toBeVisible();
    await expect(sheet).toContainText('Dumpling Den');
    await expect(sheet.getByTestId('quest-starts')).toHaveText(/Starts in \d+ min|Happening now/);
    await expect(sheet.getByTestId('quest-walk')).toHaveText(/\d+ min walk/);
    await expect(sheet.getByTestId('quest-seats')).toHaveText(/\d+ spots? left|Full/);
    await expect(sheet).toContainText('Up to $12');
    await expect(sheet.getByTestId('quest-going')).toContainText('Kai Nakamura');
    await expect(page).toHaveURL(new RegExp(`quest=${DUMPLINGS}`));

    await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished))); // the sheet has slid up
    const attribution = page.getByTestId('map-attribution').filter({ visible: true });
    await expect(attribution).toHaveCount(1);
    await expect(attribution).toContainText('OpenFreeMap © OpenMapTiles Data from OpenStreetMap');
    const a = (await attribution.boundingBox())!;
    const s = (await sheet.boundingBox())!;
    expect(a.y + a.height).toBeLessThanOrEqual(s.y + 1);
    expect(a.y).toBeGreaterThan(56);

    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toHaveCount(0);

    await openMap(page, 'alex', `&quest=${ART_WALK}`);
    await expect(sheet.getByRole('heading', { name: 'Art walk at Gallery 1600' })).toBeVisible();
    await sheet.getByRole('button', { name: 'Report' }).click();
    await expect(page.getByText('Thanks. We’ll review this plan.')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a "+N" bubble zooms in on the plans it holds', async ({ page }) => {
    await openMap(page, 'alex');
    await expect(page.getByTestId('quest-pin-dumplings')).toBeVisible();
    await page.waitForTimeout(500);
    const bubble = page.locator('[data-role="cluster"]').filter({ visible: true }).first();
    test.skip((await bubble.count()) === 0, 'no pins are grouped at this framing');
    const root = bubble.locator('xpath=..');
    const id = await root.getAttribute('data-quest-id');
    const n = Number(((await bubble.textContent()) ?? '+0').slice(1));
    const hiddenBefore = await page.locator('[data-quest-id][data-clustered]').count();
    await bubble.click();
    // After the zoom the group splits: fewer pins are folded away, or this bubble holds fewer.
    await expect.poll(async () => {
      const hidden = await page.locator('[data-quest-id][data-clustered]').count();
      const same = page.locator(`[data-quest-id="${id}"] [data-role="cluster"]`);
      const now = (await same.isVisible()) ? Number(((await same.textContent()) ?? '+0').slice(1)) : 0;
      return hidden < hiddenBefore || now < n;
    }, { timeout: 10_000 }).toBe(true);
  });

  test('join and leave update the seat count on the pin and in the sheet', async ({ page }) => {
    // Thrift may sit in a "+N" group on a phone, so open it by link; its pin still tracks seats.
    await openMap(page, 'alex', `&quest=${seedId('quest', 'thrift')}`);
    const pin = page.getByTestId('quest-pin-thrift');
    await expect(pin).toHaveAttribute('aria-label', /\d+ left/);
    const before = await badgeSeats(pin);
    expect(before).toBeGreaterThan(0);
    const sheet = page.getByTestId('quest-sheet');
    await expect(sheet.getByRole('heading', { name: 'Thrift walk on Willow' })).toBeVisible();
    await sheet.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(sheet.getByRole('button', { name: 'Leave' })).toBeVisible();
    await expect(sheet.getByTestId('quest-going')).toContainText('Alex Rivera (you)');
    await expect(pin).toHaveAttribute('aria-label', new RegExp(before - 1 > 0 ? `${before - 1} left` : 'Full'));
    await sheet.getByRole('button', { name: 'Leave' }).click();
    await expect(sheet.getByRole('button', { name: 'Join', exact: true })).toBeVisible();
    await expect(pin).toHaveAttribute('aria-label', new RegExp(`${before} left`));
  });

  test('Friends view shows only plans friends joined', async ({ page }) => {
    await openMap(page, 'alex');
    await expect(page.getByTestId('quest-pin-dumplings')).toBeVisible();
    const all = await page.locator('[data-map-marker="quest"]').count();
    await page.getByTestId('map-mode-friends').click();
    await expect(page.getByTestId('map-mode-friends')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('out-here-map')).toHaveAttribute('data-mode', 'friends');
    // Kai (Alex's friend) hosts the dumpling quest, so it stays; the count can only shrink.
    await expect(page.getByTestId('quest-pin-dumplings')).toBeVisible();
    const friendsCount = await page.locator('[data-map-marker="quest"]').count();
    expect(friendsCount).toBeLessThanOrEqual(all);
    // The filter says what it shows, and each pin names the friends going.
    // The Friends tab's list says what the map shows.
    await page.getByTestId('dock-handle').click();
    await expect(page.getByTestId('friends-filter-chip')).toHaveText(`Plans your friends joined · ${friendsCount}`);
    await page.getByTestId('dock-handle').click();
    await expect(page.getByTestId('quest-pin-dumplings')).toHaveAttribute('aria-label', /Kai( and .+)? going/); // Maya may be in too (outhere.spec)
    await page.getByTestId('quest-pin-dumplings').click();
    await expect(page.getByTestId('quest-sheet').getByTestId('quest-friends-going')).toHaveText(/Kai Nakamura (is|and .+ are) going/);
    await page.getByTestId('quest-sheet').getByRole('button', { name: 'Close' }).click();
    await page.getByTestId('map-mode-explore').click();
    await expect(page.locator('[data-map-marker="quest"]')).toHaveCount(all);
  });

  test('without WebGL the plans show as a list that opens the sheet', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      // @ts-expect-error test override
      HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
        return orig.call(this, type, ...rest);
      };
    });
    await openMap(page, 'alex');
    await expect(page.getByTestId('map-fallback')).toBeVisible();
    await page.getByTestId('quest-pin-dumplings').click();
    await expect(page.getByTestId('quest-sheet').getByRole('heading', { name: 'Dumplings before the rush' })).toBeVisible();
  });
});

test.describe('desktop 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(({}, info) => {
    test.skip(!info.project.name.startsWith('desktop'), 'desktop project only');
  });

  test('a join by Maya updates the seat badge on Alex’s map live', async ({ browser }) => {
    const alex = await newPersonaPage(browser, 'alex', { width: 1440, height: 900 });
    const maya = await newPersonaPage(browser, 'maya', { width: 1440, height: 900 });
    const alexPin = alex.getByTestId('quest-pin-board-games');
    await expect(alexPin).toBeVisible();
    const before = await badgeSeats(alexPin);
    expect(before).toBeGreaterThan(0);

    await alexPin.click();
    const alexSheet = alex.getByTestId('quest-sheet');
    await expect(alexSheet.getByRole('heading', { name: 'Board game night' })).toBeVisible();
    const sheetBox = (await alexSheet.boundingBox())!;
    expect(sheetBox.x).toBeLessThan(40); // left side panel
    expect(sheetBox.width).toBeLessThan(420);

    await maya.getByTestId('quest-pin-board-games').click();
    const mayaSheet = maya.getByTestId('quest-sheet');
    await mayaSheet.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(mayaSheet.getByRole('button', { name: 'Leave' })).toBeVisible();

    const after = new RegExp(before - 1 > 0 ? `${before - 1} left` : 'Full');
    await expect(alexPin).toHaveAttribute('aria-label', after, { timeout: 5000 });
    await expect(alexSheet.getByTestId('quest-going')).toContainText('Maya Chen', { timeout: 5000 });

    await mayaSheet.getByRole('button', { name: 'Leave' }).click();
    await expect(alexPin).toHaveAttribute('aria-label', new RegExp(`${before} left`), { timeout: 5000 });
    await alex.context().close();
    await maya.context().close();
  });

  test('?quest= deep link opens the quest panel and attribution stays visible', async ({ page }) => {
    await openMap(page, 'alex', `&quest=${DUMPLINGS}`);
    const sheet = page.getByTestId('quest-sheet');
    await expect(sheet.getByRole('heading', { name: 'Dumplings before the rush' })).toBeVisible();
    await expect(sheet.getByTestId('quest-walk')).toHaveText(/\d+ min walk/);
    await expect(page.getByTestId('map-attribution').filter({ visible: true })).toHaveCount(1);
    // The panel is only as tall as its content, and the map moves the pin out from under it.
    await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished))); // the sheet has slid up
    const s = (await sheet.boundingBox())!;
    expect(s.height).toBeLessThan(700);
    // The plan card's one action (Join) is on screen inside the panel, no scrolling needed.
    const join = (await sheet.getByRole('button', { name: /^(Join|Full)$/ }).boundingBox())!;
    expect(join.y + join.height).toBeLessThanOrEqual(s.y + s.height);
    await expect.poll(async () => (await page.getByTestId('quest-pin-dumplings').boundingBox())?.x ?? 0, { timeout: 5000 }).toBeGreaterThan(s.x + s.width);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(page).not.toHaveURL(/quest=/);
  });

  test('when map tiles fail the pins stay up over a plain background', async ({ page }) => {
    await page.route('**/tiles.openfreemap.org/**', (r) => r.abort());
    await openMap(page, 'alex');
    await expect(page.getByTestId('quest-pin-dumplings')).toBeVisible();
    await expect(page.locator('[data-tiles]')).toHaveAttribute('data-tiles', 'failed', { timeout: 12_000 });
    await expect(page.getByText("Map details didn't load. Plans are still live.")).toBeVisible();
    await page.getByTestId('quest-pin-dumplings').click();
    await expect(page.getByTestId('quest-sheet').getByRole('heading', { name: 'Dumplings before the rush' })).toBeVisible();
  });
});
