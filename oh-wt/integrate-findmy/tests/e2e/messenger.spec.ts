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
    await expect(page.getByTestId('conversation-subtitle')).toHaveText(/^Active /);
    // header actions: calls explain they are not in the demo; Info opens the details pane
    await page.getByTestId('call-voice').click();
    await expect(page.getByText("Calls aren't available in this demo.")).toBeVisible();
    await page.getByTestId('conversation-info-button').click();
    const pane = page.getByTestId('conversation-info');
    await expect(pane).toBeVisible();
    await expect(pane.getByTestId('info-view-profile')).toHaveAttribute('href', '/profile/maya');
    await page.getByTestId('conversation-info-button').click();
    await expect(pane).toBeHidden();
    if (info.project.name === 'phone') {
      // an open chat fills the screen, above the shell's top and bottom bars
      const box = await page.getByTestId('conversation').boundingBox();
      const vp = page.viewportSize()!;
      expect(box && Math.round(box.y)).toBe(0);
      expect(box && Math.round(box.height)).toBe(vp.height);
      await expect(page.getByTestId('composer-input')).toBeInViewport();
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

  test('filter chips, options menu and New message picker', async ({ page }, info) => {
    const errors = watchErrors(page);
    const as = OPENER[info.project.name as keyof typeof OPENER] ?? 'alex';
    await page.goto(`/messages?as=${as}`);
    const rows = page.getByTestId('thread-row');
    await expect(rows.first()).toBeVisible();
    const total = await rows.count();
    await page.getByTestId('chat-filter-groups').click();
    await expect(page.getByTestId('chat-filter-groups')).toHaveAttribute('aria-pressed', 'true');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeLessThan(total);
    await expect(page.locator('[data-testid="thread-row"][data-title="UCSD forever"]')).toBeVisible();
    await page.getByTestId('chat-filter-unread').click();
    const unreadRows = await rows.count();
    expect(await page.getByTestId('unread-dot').count()).toBe(unreadRows);
    await page.getByTestId('chat-filter-all').click();
    await expect(rows).toHaveCount(total);
    await page.getByTestId('chat-options').click();
    await expect(page.getByTestId('chat-options-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('chat-options-menu')).toBeHidden();
    await page.getByTestId('new-message').click();
    await expect(page.getByTestId('new-message-picker')).toBeVisible();
    const person = page.getByTestId('new-message-person').first();
    await expect(person).toBeVisible();
    const name = (await person.textContent())?.trim() ?? '';
    await page.getByTestId('new-message-to').fill(name.slice(0, 3));
    await expect(page.getByTestId('new-message-person').first()).toHaveText(name);
    await page.getByTestId('new-message-person').first().click();
    await expect(page).toHaveURL(/\/messages\?thread=[0-9a-f-]+/);
    await expect(page.getByTestId('conversation-title')).toHaveText(name);
    expect(errors).toEqual([]);
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
    // a chat nobody has written in is listed only while it is open
    const sayHi = page.getByText('Say hi to start the conversation.');
    await expect(page.getByTestId('message-list').locator('[data-testid^="bubble-"]').first().or(sayHi)).toBeVisible();
    const empty = await sayHi.isVisible();
    if (empty) {
      if (info.project.name === 'desktop') {
        await expect(page.locator('[data-testid="thread-row"][data-title^="Jordan"]')).toHaveCount(1);
      }
      await page.goto(`/messages?as=${as}`);
      await expect(page.getByTestId('thread-row').first()).toBeVisible();
      await expect(page.locator('[data-testid="thread-row"][data-title^="Jordan"]')).toHaveCount(0);
      await page.getByTestId('messenger-button').click();
      const panel = page.getByTestId('messenger-panel');
      await expect(panel.getByTestId('thread-row').first()).toBeVisible();
      await expect(panel.locator('[data-testid="thread-row"][data-title^="Jordan"]')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });

  test('top-bar Messenger popover lists chats and navigates', async ({ page }, info) => {
    const errors = watchErrors(page);
    await page.goto('/?as=alex');
    await page.getByTestId('messenger-button').click();
    const panel = page.getByTestId('messenger-panel');
    await expect(panel).toBeVisible();
    const rows = panel.getByTestId('thread-row');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeLessThanOrEqual(6);
    await expect(panel.getByTestId('new-message')).toBeVisible();
    await expect(panel.getByTestId('chat-filter-unread')).toBeVisible();
    await panel.getByTestId('chat-search').fill('sac');
    await expect(rows).toHaveCount(1);
    await panel.getByTestId('chat-search').fill('');
    const title = (await rows.first().getAttribute('data-title')) ?? '';
    await rows.first().click();
    await expect(page).toHaveURL(/\/messages\?thread=/);
    await expect(page.getByTestId('conversation-title')).toHaveText(title);
    await expect(panel).toBeHidden();
    // on phones an open chat covers the top bar; Back shows the chat list and the top bar again
    if (info.project.name === 'phone') await page.getByRole('button', { name: 'Back to chats' }).click();
    await page.getByTestId('messenger-button').click();
    await page.getByTestId('see-all-messenger').click();
    await expect(page).toHaveURL(/\/messages$/);
    expect(errors).toEqual([]);
  });
});
