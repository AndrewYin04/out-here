import { expect, test, type Browser, type ConsoleMessage, type Page } from '@playwright/test';

// Profile and Friends flows at 1440 (desktop project) and 390 (phone project). Each project
// uses its own personas, so the two projects can share one server without colliding, and
// every test puts the friend graph back the way it found it.

const PAIRS = {
  desktop: {
    asker: 'nina', askerName: 'Nina Park', target: 'maya', deleter: 'leo', deleterName: 'Leo Marchetti',
    canceler: 'nina', cancelTarget: 'leo', editor: 'alex',
  },
  phone: {
    asker: 'kai', askerName: 'Kai Nakamura', target: 'maya', deleter: 'sam', deleterName: 'Sam Okafor',
    canceler: 'kai', cancelTarget: 'priya', editor: 'jordan',
  },
} as const;

function pair(name: string) {
  return name === 'phone' ? PAIRS.phone : PAIRS.desktop;
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    if (msg.text().startsWith('Failed to load resource') && msg.location().url.includes('/seed/')) return;
    errors.push(`${msg.text()} @ ${msg.location().url}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

async function personaPage(browser: Browser, info: { project: { use: object } }) {
  const ctx = await browser.newContext(info.project.use);
  return ctx.newPage();
}

/** Direct API call as a persona (setup and cleanup only; the flows themselves use the UI). */
async function api(page: Page, persona: string, method: 'GET' | 'POST' | 'DELETE', path: string, data?: unknown) {
  const res = await page.request.fetch(path, { method, headers: { 'x-persona': persona }, data });
  return res.json();
}

test('Intro shows only the fields the viewer can see', async ({ page }, info) => {
  const errors = watchErrors(page);
  const p = pair(info.project.name);

  await page.goto('/profile/maya?as=alex');
  await expect(page.getByRole('heading', { level: 1, name: 'Maya Chen' })).toBeVisible();
  const intro = page.getByTestId('intro-card');
  await expect(intro.locator('[data-field="job"]')).toHaveText('UX researcher');
  await expect(intro.locator('[data-field="hometown"]')).toContainText('Cupertino');
  await expect(page.getByTestId('profile-actions').getByRole('button', { name: 'Friends' })).toBeVisible();
  // Message stays hidden until the Messenger slice opens a thread from ?to= (MESSENGER_TO_READY).
  await expect(page.getByTestId('profile-actions').getByRole('link', { name: 'Message' })).toHaveCount(0);
  await expect(page.getByTestId('profile-post').first()).toBeVisible();

  // The cover is a photo, and the avatar sits on it (overlaps the cover by about 84 px).
  const cover = page.getByTestId('profile-cover');
  await expect(cover.locator('img')).toHaveAttribute('src', /\/seed\/.+\.webp$/);
  const coverBox = await cover.boundingBox();
  const avatarBox = await page.getByTestId('profile-avatar').boundingBox();
  expect(coverBox!.y + coverBox!.height - avatarBox!.y).toBeGreaterThanOrEqual(70);

  // Out Here card: Maya's live "I'm free" signal and a hang action, for friends only.
  const outHere = page.getByTestId('outhere-card');
  await expect(outHere).toContainText('min walk from you');
  await expect(outHere.getByRole('link', { name: 'Want to hang with Maya?' })).toHaveAttribute('href', '/out-here?with=maya');

  // A non-friend sees the public fields only, plus the mutual friend count.
  await page.goto(`/profile/maya?as=${p.asker}`);
  await expect(page.getByTestId('profile-view')).toHaveAttribute('data-relationship', 'none');
  await expect(intro.locator('[data-field="currentCity"]')).toContainText('Redwood City');
  await expect(intro.locator('[data-field="job"]')).toHaveCount(0);
  await expect(intro.locator('[data-field="hometown"]')).toHaveCount(0);
  await expect(page.getByTestId('mutual-count')).toHaveText('1 mutual');
  await expect(page.getByTestId('outhere-card')).toHaveCount(0);

  await page.getByTestId('mutual-count').click();
  await expect(page).toHaveURL(/tab=friends/);
  await expect(page.getByRole('list', { name: 'Mutual friends' }).getByTestId('profile-friend')).toHaveCount(1);
  await page.getByRole('tab', { name: /All friends/ }).click();
  await expect(page.getByRole('list', { name: 'Friends' }).getByTestId('profile-friend')).toHaveCount(11);

  await page.getByRole('link', { name: 'Photos', exact: true }).click();
  await expect(page.getByTestId('photos-tab').getByTestId('profile-photo').first()).toBeVisible();

  await page.getByRole('link', { name: 'About', exact: true }).click();
  await expect(page.getByTestId('about-card').locator('[data-field="job"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Edit profile saves the bio and who can see a detail', async ({ page }, info) => {
  const errors = watchErrors(page);
  const me = pair(info.project.name).editor;
  const before = await api(page, me, 'GET', `/api/profile/${me}`);
  const oldBio: string = before.profile.bio;
  const oldJob: string = before.profile.fieldVisibility.job ?? 'public';

  await page.goto(`/profile/${me}?as=${me}`);
  await page.getByTestId('profile-actions').getByRole('button', { name: 'Edit profile' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit profile' });
  const bio = `E2E bio ${info.project.name}`;
  await dialog.getByTestId('bio-input').fill(bio);
  await dialog.getByTestId('audience-job').selectOption('only_me');
  await dialog.getByTestId('save-profile').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('intro-card')).toContainText(bio);

  // Another persona no longer sees the job the editor set to Only me.
  const seen = await api(page, 'priya', 'GET', `/api/profile/${me}`);
  expect(seen.profile.job).toBeNull();

  // Restore through the same dialog.
  await page.getByTestId('intro-card').getByRole('button', { name: 'Edit details' }).click();
  await dialog.getByTestId('bio-input').fill(oldBio);
  await dialog.getByTestId('audience-job').selectOption(oldJob);
  await dialog.getByTestId('save-profile').click();
  await expect(dialog).toHaveCount(0);
  const after = await api(page, me, 'GET', `/api/profile/${me}`);
  expect(after.profile.bio).toBe(oldBio);
  expect(after.profile.fieldVisibility.job ?? 'public').toBe(oldJob);
  expect(errors).toEqual([]);
});

test('two personas: a canceled request leaves the other side live', async ({ page, browser }, info) => {
  const p = pair(info.project.name);
  await api(page, p.canceler, 'DELETE', `/api/friends/${p.cancelTarget}`);

  const other = await personaPage(browser, info);
  try {
    await other.goto(`/friends?tab=requests&as=${p.cancelTarget}`);
    const tile = other.locator(`[data-testid="person-tile"][data-handle="${p.canceler}"]`);
    await expect(other.getByRole('heading', { name: 'Friend requests' })).toBeVisible();

    await page.goto(`/profile/${p.cancelTarget}?as=${p.canceler}`);
    const actions = page.getByTestId('profile-actions');
    await actions.getByRole('button', { name: 'Add friend' }).click();
    await expect(tile).toBeVisible({ timeout: 10_000 });

    await actions.getByRole('button', { name: 'Cancel request' }).click();
    await expect(actions.getByRole('button', { name: 'Add friend' })).toBeVisible();
    // The canceled request leaves the recipient's grid without a reload.
    await expect(tile).toHaveCount(0, { timeout: 10_000 });
  } finally {
    await other.context().close();
  }

  // With live updates cut off, a stale Confirm says the request is gone instead of a raw error.
  await api(page, p.canceler, 'POST', '/api/friends/requests', { toId: p.cancelTarget });
  const stale = await personaPage(browser, info);
  try {
    await stale.route('**/api/realtime?**', (r) => r.abort());
    await stale.goto(`/friends?tab=requests&as=${p.cancelTarget}`);
    const tile = stale.locator(`[data-testid="person-tile"][data-handle="${p.canceler}"]`);
    await expect(tile).toBeVisible();
    await api(page, p.canceler, 'DELETE', `/api/friends/${p.cancelTarget}`);
    await tile.getByRole('button', { name: 'Confirm' }).click();
    await expect(tile).toContainText('This request is no longer available');
    await expect(tile.getByRole('button')).toHaveCount(0);
    await expect(stale.getByText('no pending request')).toHaveCount(0);
  } finally {
    await stale.context().close();
  }
});

test('phone: the selected section chip is scrolled into view', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the chip row only shows below 1024 px');
  for (const tab of ['lists', 'all', 'birthdays']) {
    await page.goto(`/friends?tab=${tab}&as=alex`);
    const chip = page.getByTestId('section-chips').locator('[aria-current="page"]');
    await expect(chip).toBeVisible();
    await expect.poll(async () => {
      const b = await chip.boundingBox();
      const w = page.viewportSize()!.width;
      return b ? b.x >= 0 && b.x + b.width <= w : false;
    }).toBe(true);
  }
});

test('two personas: Add friend, then Confirm from Friend requests', async ({ page, browser }, info) => {
  const p = pair(info.project.name);
  const errors = watchErrors(page);
  // Start clean: no friendship or pending request between the pair.
  await api(page, p.asker, 'DELETE', `/api/friends/${p.target}`);

  await page.goto(`/profile/${p.target}?as=${p.asker}`);
  const actions = page.getByTestId('profile-actions');
  await actions.getByRole('button', { name: 'Add friend' }).click();
  await expect(actions.getByRole('button', { name: 'Cancel request' })).toBeVisible();

  // The other persona, in its own browser context, confirms the request.
  const other = await personaPage(browser, info);
  try {
    await other.goto(`/friends?tab=requests&as=${p.target}`);
    const tile = other.locator(`[data-testid="person-tile"][data-handle="${p.asker}"]`);
    await expect(tile).toBeVisible();
    await tile.getByRole('button', { name: 'Confirm' }).click();
    await expect(tile).toContainText('Request accepted');
  } finally {
    await other.context().close();
  }

  // The asker's profile view follows without a reload (user:<id> notification), and the
  // friends-only fields appear.
  await expect(actions.getByRole('button', { name: 'Friends' })).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByTestId('intro-card').locator('[data-field="job"]')).toHaveText('UX researcher');

  // Unfriend through the Friends menu, which restores the seed graph.
  await actions.getByRole('button', { name: 'Friends' }).click();
  await page.getByRole('menuitem', { name: 'Unfriend' }).click();
  await expect(actions.getByRole('button', { name: 'Add friend' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Delete a friend request', async ({ page }, info) => {
  const p = pair(info.project.name);
  await api(page, p.deleter, 'DELETE', '/api/friends/priya');
  await api(page, p.deleter, 'POST', '/api/friends/requests', { toId: 'priya' });

  await page.goto('/friends?as=priya');
  const tile = page.locator(`[data-testid="person-tile"][data-handle="${p.deleter}"]`);
  await expect(tile).toContainText(p.deleterName);
  await tile.getByRole('button', { name: 'Delete' }).click();
  await expect(tile).toContainText('Request removed');
  const after = await api(page, 'priya', 'GET', '/api/friends/requests');
  expect(after.incoming.some((r: { person: { handle: string } }) => r.person.handle === p.deleter)).toBe(false);
});

test('Suggestions: Add friend, Cancel, Remove', async ({ page }, info) => {
  const viewer = info.project.name === 'phone' ? 'jordan' : 'alex';
  await page.goto(`/friends?tab=suggestions&as=${viewer}`);
  const tiles = page.getByTestId('person-tile');
  await expect(tiles.first()).toBeVisible();
  const first = tiles.first();
  const handle = await first.getAttribute('data-handle');
  const tile = page.locator(`[data-testid="person-tile"][data-handle="${handle}"]`);
  await tile.getByRole('button', { name: 'Add friend' }).click();
  await expect(tile.getByRole('button', { name: 'Request sent' })).toBeDisabled();
  const sent = await api(page, viewer, 'GET', '/api/friends/requests');
  expect(sent.outgoing.some((r: { person: { handle: string } }) => r.person.handle === handle)).toBe(true);
  await tile.getByRole('button', { name: 'Cancel' }).click();
  await expect(tile.getByRole('button', { name: 'Add friend' })).toBeVisible();
  await tile.getByRole('button', { name: 'Remove' }).click();
  await expect(tile).toHaveCount(0);
});

test('All friends search and Custom lists', async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.goto('/friends?tab=all&as=alex');
  await expect(page.getByTestId('friend-row').first()).toBeVisible();
  await page.getByPlaceholder('Search friends').fill('maya');
  await expect(page.getByTestId('friend-row')).toHaveCount(1);
  await expect(page.getByTestId('friend-row')).toContainText('Maya Chen');

  await page.goto('/friends?tab=lists&as=alex');
  await expect(page.locator('[data-testid="friend-list"][data-name="Close friends"]')).toBeVisible();
  const name = `E2E ${info.project.name} ${Date.now()}`;
  await page.getByPlaceholder('New list name').fill(name);
  await page.getByRole('button', { name: 'Create list' }).click();
  const list = page.locator(`[data-testid="friend-list"][data-name="${name}"]`);
  await expect(list.getByTestId('list-count')).toHaveText('0 members');
  await list.getByRole('button', { name: `Add Maya Chen to ${name}` }).click();
  await expect(list.getByTestId('list-count')).toHaveText('1 member');
  await list.getByRole('button', { name: `Remove Maya Chen from ${name}` }).click();
  await expect(list.getByTestId('list-count')).toHaveText('0 members');

  // Cleanup: the UI has no delete for lists yet; remove it through the API.
  const { lists } = await api(page, 'alex', 'GET', '/api/friend-lists');
  const created = lists.find((l: { name: string }) => l.name === name);
  if (created) await api(page, 'alex', 'DELETE', `/api/friend-lists/${created.id}`);
  expect(errors).toEqual([]);
});
