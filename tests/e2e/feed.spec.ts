import { expect, test, type Browser, type ConsoleMessage, type Page } from '@playwright/test';

// Home feed flows at 1440 (desktop project) and 390 (phone project): stories viewer,
// composer with audience and photo, reactions, comments with a reply, share, and a second
// persona seeing a comment live.

// 1x1 PNG for the photo upload.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

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

async function openHome(page: Page, as = 'alex') {
  await page.goto(`/?as=${as}`);
  await expect(page.getByTestId('home-feed')).toBeVisible();
  await expect(page.getByTestId('post-card').first()).toBeVisible({ timeout: 20_000 });
}

const isPhone = (name: string) => name.startsWith('phone');

test('collapsed posts preview at most one comment and no replies', async ({ page }) => {
  await openHome(page);
  const cards = page.getByTestId('post-card');
  const n = await cards.count();
  let withMore: number | null = null;
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i);
    expect(await card.getByTestId('comment').count()).toBeLessThanOrEqual(1);
    if (withMore === null && (await card.getByRole('button', { name: 'View more comments' }).count()) > 0) withMore = i;
  }
  expect(withMore).not.toBeNull();
  const card = cards.nth(withMore!);
  await card.getByRole('button', { name: 'View more comments' }).click();
  await expect.poll(() => card.getByTestId('comment').count(), { timeout: 10_000 }).toBeGreaterThan(1);
  await expect(card.getByPlaceholder('Comment as Alex Rivera')).toBeVisible();
});

test('Out Here card shows live friends and open seats, and opens the map', async ({ page }) => {
  await openHome(page);
  const card = page.getByTestId('home-outhere');
  await expect(card.getByTestId('home-outhere-free')).toContainText(/plans? near you/, { timeout: 15_000 });
  await expect(card.getByTestId('home-outhere-seats')).toHaveText(/^\d+ seats? left$/);
  await expect(card.getByRole('link', { name: "I'm free" })).toHaveAttribute('href', '/out-here?free=1');
  await card.getByTestId('home-outhere-plan').click();
  await expect(page).toHaveURL(/\/out-here\?quest=/);
});

test('feed renders composer, stories and posts', async ({ page }, info) => {
  const errors = watchErrors(page);
  await openHome(page);
  await expect(page.getByTestId('composer-card')).toContainText("What's on your mind, Alex?");
  await expect(page.getByTestId('story-card').first()).toBeVisible();
  const first = page.getByTestId('post-card').first();
  await expect(first.getByTestId('like-button')).toBeVisible();
  await expect(first.getByTestId('comment-button')).toBeVisible();
  await expect(first.getByTestId('share-button')).toBeVisible();
  await page.screenshot({ path: `test-results/feed-${info.project.name}.png` });
  // no horizontal page scroll at either width
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('story viewer opens, advances and closes', async ({ page }, info) => {
  await openHome(page);
  const cards = page.getByTestId('story-card');
  const firstName = (await cards.first().getAttribute('aria-label'))!.replace("'s story", '');
  await cards.first().click();
  const viewer = page.getByTestId('story-viewer');
  await expect(viewer).toBeVisible();
  await expect(viewer.getByTestId('story-author')).toHaveText(firstName);
  await expect(viewer.getByTestId('story-progress-active')).toBeVisible();
  // the progress bar moves on its own
  await expect.poll(async () => viewer.getByTestId('story-progress-active').evaluate((el) => parseFloat((el as HTMLElement).style.width)), { timeout: 4000 })
    .toBeGreaterThan(5);
  if ((await cards.count()) > 1) {
    const secondName = (await cards.nth(1).getAttribute('aria-label'))!.replace("'s story", '');
    // click "next" until the author changes (a person can have several stories)
    for (let i = 0; i < 6; i++) {
      if ((await viewer.getByTestId('story-author').textContent()) === secondName) break;
      await viewer.getByRole('button', { name: 'Next story' }).click();
    }
    await expect(viewer.getByTestId('story-author')).toHaveText(secondName);
    if (!isPhone(info.project.name)) {
      await viewer.getByRole('button', { name: 'Previous story' }).click();
    }
  }
  await viewer.getByRole('button', { name: 'Close story' }).click();
  await expect(viewer).toBeHidden();
});

test('create a post with audience and photo', async ({ page }) => {
  const errors = watchErrors(page);
  await openHome(page);
  const text = `Anyone up for dumplings tonight? ${Date.now()}`;
  await page.getByTestId('composer-card').getByRole('button', { name: /What's on your mind/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Create post' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Edit audience/ }).click();
  await page.getByRole('dialog', { name: 'Post audience' }).getByRole('radio', { name: /Public/ }).click();
  await expect(dialog.getByRole('button', { name: /Edit audience: Public/ })).toBeVisible();
  await dialog.getByLabel('Post text').fill(text);
  await dialog.getByTestId('photo-input').setInputFiles({ name: 'dumplings.png', mimeType: 'image/png', buffer: PNG });
  await expect(dialog.getByTestId('upload-previews').getByText('Uploading…')).toBeHidden({ timeout: 10_000 });
  await dialog.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(dialog).toBeHidden();
  const post = page.getByTestId('post-card').filter({ hasText: text });
  await expect(post).toBeVisible();
  await expect(post.getByTestId('post-media')).toBeVisible();
  await expect(post.getByLabel('Public')).toBeVisible();
  // it survives a reload (it was saved, not only shown)
  await page.reload();
  await expect(page.getByTestId('post-card').filter({ hasText: text })).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});

test('like, pick a reaction, and remove it', async ({ page }, info) => {
  await openHome(page);
  // pin the post by id: other tests add posts above it while this one runs. Each project takes
  // its own post, because phone and desktop run this test at the same time as the same persona.
  const id = await page.getByTestId('post-card').nth(isPhone(info.project.name) ? 1 : 0).getAttribute('data-post-id');
  const post = page.locator(`[data-post-id="${id}"]`);
  const like = post.getByTestId('like-button');
  // start from no reaction
  if ((await like.getAttribute('aria-pressed')) === 'true') {
    await like.click();
    await expect(like).toHaveAttribute('aria-pressed', 'false');
  }
  await like.click();
  await expect(like).toHaveAttribute('aria-label', 'Remove Like');

  // open the picker: hover with a mouse, long-press on touch. In a full run other specs add posts
  // above this one while it runs; the shift moves the post out from under the pointer and the
  // picker closes, so open it again until it stays.
  const picker = page.getByTestId('reaction-picker');
  await expect(async () => {
    if (isPhone(info.project.name)) {
      const box = (await like.boundingBox())!;
      await like.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, clientX: box.x + 5, clientY: box.y + 5 });
      await page.waitForTimeout(700);
      await like.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true });
    } else {
      await page.mouse.move(0, 0);
      await like.hover();
    }
    await expect(picker).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(picker.getByRole('button')).toHaveCount(7);
  await picker.getByRole('button', { name: 'Love' }).click();
  await expect(like).toHaveAttribute('aria-label', 'Remove Love');
  await expect(post.getByTestId('reaction-summary')).toBeVisible();
  // saved on the server
  await page.reload();
  const again = post.getByTestId('like-button');
  await expect(again).toHaveAttribute('aria-label', 'Remove Love', { timeout: 20_000 });
  await again.click();
  await expect(again).toHaveAttribute('aria-label', 'Like');
});

test('comment and reply, seen live by a second persona', async ({ page, browser, baseURL }) => {
  // Alex posts to friends, so Maya (a friend) has the same post in her feed.
  const seedText = `Dumplings after work? ${Date.now()}`;
  const res = await page.request.post('/api/posts', { headers: { 'x-persona': 'alex' }, data: { text: seedText, audience: 'friends' } });
  expect(res.ok()).toBeTruthy();
  const postId = ((await res.json()) as { post: { id: string } }).post.id;

  await openHome(page, 'alex');
  const post = page.locator(`[data-post-id="${postId}"]`);
  await expect(post).toBeVisible();

  const maya = await openSecond(browser, baseURL!, 'maya');
  const mayaPost = maya.locator(`[data-post-id="${postId}"]`);
  await expect(mayaPost).toBeVisible();
  await mayaPost.getByTestId('comment-button').click();

  const text = `Count me in ${Date.now()}`;
  await post.getByTestId('comment-button').click();
  const box = post.getByPlaceholder('Comment as Alex Rivera');
  await expect(box).toBeFocused();
  await box.fill(text);
  await box.press('Enter');
  const mine = post.getByTestId('comment').filter({ hasText: text });
  await expect(mine).toBeVisible();
  await expect(mine.getByText('Posting...')).toBeHidden({ timeout: 10_000 });
  await expect(post.getByTestId('comment-button')).toHaveAttribute('aria-label', /, 1 comment$/);

  // Maya sees it without reloading, then replies (one level)
  const onMaya = mayaPost.getByTestId('comment').filter({ hasText: text });
  await expect(onMaya).toBeVisible({ timeout: 10_000 });
  await onMaya.getByRole('button', { name: 'Reply' }).click();
  const reply = mayaPost.getByPlaceholder('Reply to Alex...');
  const replyText = `See you there ${Date.now()}`;
  await reply.fill(replyText);
  await reply.press('Enter');
  await expect(mayaPost.getByTestId('comment').filter({ hasText: replyText })).toBeVisible();

  // and Alex sees Maya's reply live
  await expect(post.getByTestId('comment').filter({ hasText: replyText })).toBeVisible({ timeout: 10_000 });
  await maya.context().close();
});

test('share a post to the feed', async ({ page }) => {
  await openHome(page);
  const source = page.getByTestId('post-card').filter({ hasNot: page.getByTestId('shared-post') }).first();
  const author = (await source.getAttribute('aria-label'))!.replace('Post by ', '');
  await source.getByTestId('share-button').click();
  await page.getByRole('menuitem', { name: 'Share to Feed' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share' });
  await expect(dialog.getByTestId('shared-post')).toContainText(author);
  const note = `Look at this ${Date.now()}`;
  await dialog.getByLabel('Post text').fill(note);
  await dialog.getByRole('button', { name: 'Share now' }).click();
  await expect(dialog).toBeHidden();
  const share = page.getByTestId('post-card').filter({ hasText: note });
  await expect(share).toBeVisible();
  await expect(share.getByTestId('shared-post')).toContainText(author);
  await expect(share).toContainText('shared a post.');
});

test('hide a post and undo', async ({ page }) => {
  await openHome(page);
  const id = await page.getByTestId('post-card').first().getAttribute('data-post-id');
  const post = page.locator(`[data-post-id="${id}"]`);
  await post.getByRole('button', { name: 'Hide post' }).click();
  await expect(page.locator(`[data-post-id="${id}"]`)).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator(`[data-post-id="${id}"]`)).toHaveCount(1);
});

async function openSecond(browser: Browser, baseURL: string, as: string): Promise<Page> {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await openHome(p, as);
  return p;
}
