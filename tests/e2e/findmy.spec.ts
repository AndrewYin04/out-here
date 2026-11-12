import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

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

async function openMap(page: Page, handle: string, width: number) {
  await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
  await page.goto(`/out-here/friends?as=${handle}`);
  await expect(page.getByTestId('findmy-map')).toBeVisible();
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

    test('friend pins, card, Want to hang?, and the People list', async ({ page }) => {
      await openMap(page, 'alex', width);
      const kai = page.locator('[data-testid="friend-pin"][data-handle="kai"]');
      await expect(kai).toContainText('chalked up');
      await expect(page.locator('[data-testid="friend-pin"][data-handle="jordan"]')).toHaveCount(0);
      await expect(page.getByTestId('my-pin')).toBeVisible();
      await page.screenshot({ path: `test-results/findmy-map-${width}.png` });

      await kai.click();
      const card = page.getByTestId('friend-card');
      await expect(card).toBeVisible();
      await expect(card).toContainText('Boulder Bay Gym');
      await expect(card).toContainText('min walk');
      await expect(card).toContainText('find a climbing buddy');
      await expect(card.getByRole('link', { name: 'View profile' })).toHaveAttribute('href', '/profile/kai');
      await expect(card.getByRole('link', { name: 'Message' })).toHaveAttribute('href', '/messages?to=kai');
      await page.screenshot({ path: `test-results/findmy-card-${width}.png` });
      await card.getByRole('button', { name: 'Want to hang?' }).click();
      await page.getByLabel('Want to hang with Kai?').fill('Climb then food?');
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

test.describe('two personas, live', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'mutates Maya; runs once'); });

  test('Maya edits her bubble and hides herself; Alex sees both within 2 s', async ({ browser, request }) => {
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();
    try {
      await openMap(a, 'alex', 1440);
      const mayaPin = a.locator('[data-testid="friend-pin"][data-handle="maya"]');
      await expect(mayaPin).toContainText('craving dumplings');

      await openMap(b, 'maya', 1440);
      await b.getByRole('button', { name: 'Your status' }).click();
      await b.getByLabel("What's on your mind?").fill('ramen instead?');
      await b.getByRole('button', { name: 'Save' }).click();
      await expect(b.getByText('Your status is updated')).toBeVisible();
      await expect(mayaPin).toContainText('ramen instead?', { timeout: 2_000 });

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
