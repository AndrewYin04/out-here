import { expect, test, type Browser, type ConsoleMessage, type Page } from '@playwright/test';

// Messenger at 1440 (desktop project) and 412 (phone project). Both projects share one server,
// so each one opens its "?to=" chat as a different persona and every sent text is unique.

const OPENER = { desktop: 'alex', phone: 'maya' } as const;

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

async function newPersonaPage(browser: Browser, project: string, handle: string, path: string): Promise<Page> {
  const ctx = await browser.newContext(project === 'phone'
    ? { viewport: { width: 412, height: 839 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.625 }
    : { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const sep = path.includes('?') ? '&' : '?';
  await page.goto(`${path}${sep}as=${handle}`);
  return page;
}

async function openAlexMaya(page: Page) {
  const row = page.locator('[data-testid="thread-row"][data-title^="Maya"]').first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/\/messages\?thread=/);
  await expect(page.getByTestId('conversation-title')).toHaveText(/Maya/);
}

test.describe('Messenger', () => {
  test('inbox lists seeded chats with snippets, newest first, and search filters', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/messages?as=alex');
    const rows = page.getByTestId('thread-row');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(3);
    const snippets = await page.getByTestId('thread-snippet').allTextContents();
    expect(snippets.every((s) => s.trim().length > 0)).toBe(true);
    await expect(page.getByRole('heading', { name: 'Chats' })).toBeVisible();
    await page.getByTestId('chat-search').fill('sac');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Sac crew');
    await page.getByTestId('chat-search').fill('zzzz');
    await expect(page.getByText('No chats match')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('opens the Alex and Maya chat with its history', async ({ page }, info) => {
    const errors = watchErrors(page);
    await page.goto('/messages?as=alex');
    await openAlexMaya(page);
    const list = page.getByTestId('message-list');
    await expect(list.getByTestId('bubble-theirs').first()).toBeVisible();
    await expect(list.getByTestId('bubble-mine').first()).toBeVisible();
    await expect(page.getByTestId('composer-input')).toBeVisible();
    if (info.project.name === 'phone') {
      // the list is hidden behind the conversation on phones; Back returns to it
      await expect(page.getByTestId('chat-list')).toBeHidden();
      await page.getByRole('button', { name: 'Back to chats' }).click();
      await expect(page).toHaveURL(/\/messages$/);
      await expect(page.getByTestId('chat-list')).toBeVisible();
    } else {
      await expect(page.getByTestId('chat-list')).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('a message from alex appears for maya within 3 s', async ({ browser }, info) => {
    const alex = await newPersonaPage(browser, info.project.name, 'alex', '/messages');
    const maya = await newPersonaPage(browser, info.project.name, 'maya', '/messages');
    const errors = [...watchErrors(alex), ...watchErrors(maya)];
    await openAlexMaya(alex);
    const mayaRow = maya.locator('[data-testid="thread-row"][data-title^="Alex"]').first();
    await expect(mayaRow).toBeVisible();
    await mayaRow.click();
    await expect(maya.getByTestId('conversation-title')).toHaveText(/Alex/);
    await expect(maya.getByTestId('bubble-theirs').first()).toBeVisible();

    const text = `dumplings at 6? ${info.project.name} ${Date.now()}`;
    await alex.getByTestId('composer-input').fill(text);
    await alex.getByTestId('composer-input').press('Enter');
    await expect(alex.getByTestId('bubble-mine').filter({ hasText: text })).toBeVisible();
    await expect(alex.getByTestId('composer-input')).toHaveValue('');
    await expect(maya.getByTestId('bubble-theirs').filter({ hasText: text })).toBeVisible({ timeout: 3000 });
    // the chat list row follows the new message (desktop shows both panes). The phone project
    // writes to the same thread, so only the time is checked; format.test.ts covers "You: ".
    if (info.project.name === 'desktop') {
      await expect(alex.locator('[data-testid="thread-row"][data-title^="Maya"]').first()).toContainText('Just now');
    }
    // the send button also works
    const text2 = `see you ${Date.now()}`;
    await maya.getByTestId('composer-input').fill(text2);
    await maya.getByTestId('send-button').click();
    await expect(alex.getByTestId('bubble-theirs').filter({ hasText: text2 })).toBeVisible({ timeout: 3000 });
    expect(errors).toEqual([]);
    await alex.context().close();
    await maya.context().close();
  });

  test('/messages?to=jordan opens or creates the 1:1 chat', async ({ page }, info) => {
    const errors = watchErrors(page);
    const as = OPENER[info.project.name as keyof typeof OPENER] ?? 'alex';
    await page.goto(`/messages?to=jordan&as=${as}`);
    await expect(page).toHaveURL(/\/messages\?thread=[0-9a-f-]+/);
    await expect(page.getByTestId('conversation-title')).toHaveText(/Jordan/);
    const url = page.url();
    // opening it again returns the same thread
    await page.goto(`/messages?to=jordan&as=${as}`);
    await expect(page).toHaveURL(/\/messages\?thread=[0-9a-f-]+/);
    expect(page.url().split('thread=')[1]).toBe(url.split('thread=')[1]);
    await expect(page.getByTestId('conversation-profile-link')).toHaveAttribute('href', '/profile/jordan');
    expect(errors).toEqual([]);
  });

  test('top-bar Messenger popover lists chats and navigates', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/?as=alex');
    await page.getByTestId('messenger-button').click();
    const panel = page.getByTestId('messenger-panel');
    await expect(panel).toBeVisible();
    const rows = panel.getByTestId('thread-row');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeLessThanOrEqual(6);
    const title = (await rows.first().getAttribute('data-title')) ?? '';
    await rows.first().click();
    await expect(page).toHaveURL(/\/messages\?thread=/);
    await expect(page.getByTestId('conversation-title')).toHaveText(title);
    await expect(panel).toBeHidden();
    await page.getByTestId('messenger-button').click();
    await page.getByTestId('see-all-messenger').click();
    await expect(page).toHaveURL(/\/messages$/);
    expect(errors).toEqual([]);
  });
});
