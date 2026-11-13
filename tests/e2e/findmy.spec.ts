import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { declineTracked, trackInvites } from './invites';

// Find My inside Facebook: friend pins with status bubbles, the friend card, the People list,
// sharing settings, and live updates between two personas. Runs at 390 (phone project) and
// 1440 (desktop project).

type Pin = { friend: { id: string; handle: string; name: string; home: unknown }; distanceKm: number; bubble: { thought: string | null } };

const asPersona = (handle: string) => ({ 'x-persona': handle });

async function pinsFor(request: APIRequestContext, handle: string): Promise<Pin[]> {
  const res = await request.get('/api/locations/friends', { headers: asPersona(handle) });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { pins: Pin[] }).pins;
}

async function openMap(page: Page, handle: string, width: number, path = '/out-here/friends') {
  await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}as=${handle}`);
  // /out-here/friends redirects to /out-here?mode=friends, which opens the map in Friends mode.
  await expect(page.getByTestId('out-here-map')).toHaveAttribute('data-mode', 'friends');
  await expect(page.locator('[data-testid="friend-pin"]').first()).toBeVisible({ timeout: 15_000 });
}

test.describe('API', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'API checks run once'); });

  test('alex sees local friends with bubbles, never non-friends, paused or expired shares', async ({ request }) => {
    const pins = await pinsFor(request, 'alex');
    const handles = pins.map((p) => p.friend.handle);
    const local = pins.filter((p) => p.distanceKm < 5 && p.bubble.thought);
    expect(local.length).toBeGreaterThanOrEqual(4);
    for (const h of ['jordan', 'nina', 'priya', 'olivia', 'nate']) expect(handles).not.toContain(h);
    for (const p of pins) expect(p.friend.home).toBeNull();
  });

  test('sharing with the public is rejected', async ({ request }) => {
    const res = await request.put('/api/locations/me', { headers: asPersona('maya'), data: { audience: 'public' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBeTruthy();
  });

  test('profiles of other people carry no home location', async ({ request }) => {
    const res = await request.get('/api/users', { headers: asPersona('alex') });
    const { users } = (await res.json()) as { users: { handle: string; home: unknown }[] };
    for (const u of users) if (u.handle !== 'alex') expect(u.home).toBeNull();
  });
});

for (const width of [390, 1440]) {
  test.describe(`at ${width}px`, () => {
    test.beforeEach(({}, info) => {
      test.skip((width === 390) !== (info.project.name === 'phone'), 'one width per project');
    });
    // Want to hang? sends real invites; decline them so their toast cards do not cover later specs.
    let sent: ReturnType<typeof trackInvites> = [];
    test.beforeEach(({ page }) => { sent = trackInvites(page); });
    test.afterEach(async ({ request }) => { await declineTracked(request, sent); });

    test('friend pins, card, Want to hang?, and the People list', async ({ page }) => {
      await openMap(page, 'alex', width);
      const kai = page.locator('[data-testid="friend-pin"][data-handle="kai"]');
      await expect(kai).toHaveAttribute('aria-label', /chalked up/);
      await expect(page.locator('[data-testid="friend-pin"][data-handle="jordan"]')).toHaveCount(0);
      await expect(page.getByTestId('my-pin')).toBeVisible();
      await page.screenshot({ path: `test-results/findmy-map-${width}.png` });

      await kai.click();
      const card = page.getByTestId('friend-card');
      await expect(card).toBeVisible();
      await expect(card).toContainText('Boulder Bay Gym');
      await expect(card).toContainText('min walk');
      await expect(card).toContainText('find a climbing buddy');
      // Message opens or starts the Messenger thread with Kai
      await expect(card.getByRole('link', { name: 'Message' })).toHaveAttribute('href', '/messages?to=kai');
      await page.screenshot({ path: `test-results/findmy-card-${width}.png` });
      await card.getByRole('button', { name: 'Want to hang?' }).click();
      await expect(page.getByTestId('hang-suggestion')).toBeVisible();
      await page.getByLabel('Message to Kai').fill('Climb then food?');
      await page.getByRole('button', { name: 'Send invite' }).click();
      await expect(page.getByText(/Invite sent to Kai/)).toBeVisible();
      await expect(card).toHaveCount(0);

      await page.getByRole('button', { name: /^People/ }).click();
      const rows = page.getByTestId('people-row');
      await expect(rows.first()).toBeVisible();
      expect(await rows.count()).toBeGreaterThanOrEqual(20);
      await expect(page.getByTestId('people-list')).not.toContainText('Jordan');
      await page.screenshot({ path: `test-results/findmy-people-${width}.png` });
      // a far-away friend: the map flies out to them and opens their card
      await page.locator('[data-testid="people-row"][data-handle="ben"]').click();
      await expect(page.getByTestId('friend-card')).toContainText('New York, NY');
      await expect(page.getByTestId('friend-card')).toContainText('km away');
    });

    test('the Out Here tab in Friends mode shows the Friends map, and chips never overlap', async ({ page }) => {
      // /out-here opens in Explore; ?mode=friends opens the Friends view
      await openMap(page, 'alex', width, '/out-here?mode=friends');
      await page.waitForTimeout(1500);
      const boxes = await page.locator('[data-testid="friend-chip"]').evaluateAll((els) =>
        els.map((e) => (e.parentElement as HTMLElement).getBoundingClientRect()).map((r) => ({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom })));
      const me = await page.getByTestId('my-pin').boundingBox();
      for (let i = 0; i < boxes.length; i++) {
        const a = boxes[i];
        expect(a.x0).toBeGreaterThanOrEqual(0);
        expect(a.x1).toBeLessThanOrEqual(width);
        if (me) expect(a.x0 < me.x + me.width && me.x < a.x1 && a.y0 < me.y + me.height && me.y < a.y1).toBe(false);
        for (let j = i + 1; j < boxes.length; j++) {
          const b = boxes[j];
          expect(a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1).toBe(false);
        }
      }
      await page.screenshot({ path: `test-results/findmy-outhere-${width}.png` });
    });

    test('Want to hang? with Maya proposes Dumpling Den from her bubble before sending', async ({ page }) => {
      await openMap(page, 'alex', width);
      await page.getByRole('button', { name: /^People/ }).click();
      await page.locator('[data-testid="people-row"][data-handle="maya"]').click();
      const card = page.getByTestId('friend-card');
      await expect(card).toContainText('craving dumplings');
      if (width > 800) {
        const box = await page.getByRole('dialog').boundingBox();
        expect(box!.x + box!.width).toBeLessThanOrEqual(width - 12);
        expect(box!.height).toBeLessThan(900 - 56 - 32);
      }
      await card.getByRole('button', { name: 'Want to hang?' }).click();
      const s = page.getByTestId('hang-suggestion');
      await expect(s).toContainText('Dumpling Den');
      await expect(s).toContainText('seats left');
      await expect(page.getByTestId('hang-reason')).toContainText("Maya's status: “craving dumplings”");
      await expect(page.getByLabel('Message to Maya')).toHaveValue(/Dumpling Den/);
      await page.screenshot({ path: `test-results/findmy-hang-${width}.png` });
      await page.getByRole('button', { name: 'Send invite' }).click();
      await expect(page.getByText(/Invite sent to Maya: 🥟/)).toBeVisible();
    });

    test('tapping a status chip opens the card, like the avatar', async ({ page }) => {
      await openMap(page, 'alex', width);
      await page.waitForTimeout(1500); // chip placement settles after the first framing
      // the first friend with a chip on screen; click the chip itself, not the avatar under it
      const pin = page.locator('[data-testid="friend-pin"]', { has: page.getByTestId('friend-chip-text') }).first();
      const name = (await pin.getAttribute('aria-label'))!.split(',')[0];
      await pin.getByTestId('friend-chip').click();
      await expect(page.getByRole('dialog', { name })).toBeVisible();
      await expect(page.getByTestId('friend-card')).toBeVisible();
    });

    test('the toggle and the open card live in the URL, so Back from Messenger returns to the card', async ({ page }) => {
      await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
      await page.goto('/out-here?as=alex');
      await page.getByTestId('map-mode-friends').click();
      await expect(page).toHaveURL(/[?&]mode=friends/);
      await page.getByRole('button', { name: /^People/ }).click();
      await page.locator('[data-testid="people-row"][data-handle="maya"]').click();
      const card = page.getByTestId('friend-card');
      await expect(card).toBeVisible();
      await expect(page).toHaveURL(/[?&]friend=maya/);
      await card.getByRole('link', { name: 'Message' }).click();
      // Messenger replaces ?to=maya with ?thread=<id>; go Back once that has landed
      await page.waitForURL(/\/messages\?thread=/);
      await page.goBack();
      await expect(page.getByTestId('out-here-map')).toHaveAttribute('data-mode', 'friends');
      await expect(page.getByTestId('friend-card')).toContainText('craving dumplings', { timeout: 15_000 });
      // closing the card drops ?friend=; Explore drops ?mode=
      await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
      await expect(page).not.toHaveURL(/friend=/);
      await page.getByTestId('map-mode-explore').click();
      await expect(page).not.toHaveURL(/mode=friends/);
    });

    test('sharing settings open from the map', async ({ page }) => {
      await openMap(page, 'alex', width);
      await page.getByRole('button', { name: 'Your status' }).click();
      const form = page.getByTestId('sharing-form');
      await expect(form).toBeVisible();
      await expect(page.getByLabel("What's on your mind?")).toHaveValue('new here, say hi');
      await expect(form.getByText('Close friends')).toBeVisible();
      await expect(form.getByText('Only me')).toBeVisible();
      await expect(page.getByRole('switch', { name: 'Pause sharing' })).toHaveAttribute('aria-checked', 'false');
      await page.screenshot({ path: `test-results/findmy-sharing-${width}.png` });
    });
  });
}

test.describe('quest pins stay tappable under friends', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'phone', 'mutates Maya; runs once, at 390'); });

  test('Maya on Approximate lands near Dumpling Den; Alex taps the quest pin and its panel opens', async ({ page, request }) => {
    const put = (data: object) => request.put('/api/locations/me', { headers: asPersona('maya'), data });
    try {
      expect((await put({ precision: 'approximate' })).ok()).toBe(true);
      await openMap(page, 'alex', 390);
      const pin = page.getByTestId('quest-pin-dumplings');
      await expect(pin).toBeVisible();
      await page.waitForTimeout(1500);
      const box = (await pin.boundingBox())!;
      const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid') ?? null,
        [box.x + box.width / 2, box.y + box.height / 2]);
      expect(top).toBe('quest-pin-dumplings');
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.getByTestId('quest-sheet')).toContainText('Dumplings before the rush');
      await expect(page.getByTestId('friend-card')).toHaveCount(0);
    } finally {
      await put({ precision: 'exact' });
    }
  });
});

test.describe('two personas, live', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'mutates Maya; runs once'); });

  test('Maya edits her bubble and hides herself; Alex sees both within 2 s', async ({ browser, request }) => {
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();
    try {
      await openMap(a, 'alex', 1440);
      const mayaPin = a.locator('[data-testid="friend-pin"][data-handle="maya"]');
      await expect(mayaPin).toHaveAttribute('aria-label', /craving dumplings/);

      await openMap(b, 'maya', 1440);
      await b.getByRole('button', { name: 'Your status' }).click();
      await b.getByLabel("What's on your mind?").fill('ramen instead?');
      await b.getByRole('button', { name: 'Save' }).click();
      await expect(b.getByText('Your status is updated')).toBeVisible();
      await expect(mayaPin).toHaveAttribute('aria-label', /ramen instead?/, { timeout: 2_000 });

      await b.getByRole('button', { name: 'Your status' }).click();
      await b.getByText('Only me', { exact: true }).click();
      await b.getByRole('button', { name: 'Save' }).click();
      await expect(mayaPin).toHaveCount(0, { timeout: 2_000 });
    } finally {
      await request.put('/api/locations/me', {
        headers: asPersona('maya'),
        data: { audience: 'friends', paused: false, bubble: { emoji: '🥟', thought: 'craving dumplings' } },
      });
      await a.context().close();
      await b.context().close();
    }
  });
});
