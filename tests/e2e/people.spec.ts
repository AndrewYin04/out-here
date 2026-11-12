import { expect, test, type Browser, type ConsoleMessage, type Page } from '@playwright/test';

// Profile and Friends flows at 1440 (desktop project) and 390 (phone project). Each project
// uses its own personas, so the two projects can share one server without colliding, and
// every test puts the friend graph back the way it found it.

const PAIRS = {
  desktop: { asker: 'nina', askerName: 'Nina Park', target: 'maya', deleter: 'leo', deleterName: 'Leo Marchetti' },
  phone: { asker: 'kai', askerName: 'Kai Nakamura', target: 'maya', deleter: 'sam', deleterName: 'Sam Okafor' },
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
  await expect(page.getByTestId('profile-actions').getByRole('link', { name: 'Message' })).toHaveAttribute('href', '/messages?to=maya');
  await expect(page.getByTestId('profile-post').first()).toBeVisible();

  // A non-friend sees the public fields only, plus the mutual friend count.
  await page.goto(`/profile/maya?as=${p.asker}`);
  await expect(page.getByTestId('profile-view')).toHaveAttribute('data-relationship', 'none');
  await expect(intro.locator('[data-field="currentCity"]')).toContainText('Redwood City');
  await expect(intro.locator('[data-field="job"]')).toHaveCount(0);
  await expect(intro.locator('[data-field="hometown"]')).toHaveCount(0);
  await expect(page.getByTestId('mutual-count')).toHaveText('1 mutual');

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

test('own profile shows Edit profile and who can see each detail', async ({ page }) => {
  await page.goto('/profile/alex?as=alex');
  const edit = page.getByTestId('profile-actions').getByRole('link', { name: 'Edit profile' });
  await expect(edit).toBeVisible();
  await edit.click();
  await expect(page).toHaveURL(/tab=about/);
  await expect(page.getByTestId('field-audience').first()).toBeVisible();
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
