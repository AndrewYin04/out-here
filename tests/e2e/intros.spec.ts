import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

// Muse Intros ("Click" agents + double opt-in), mock Muse + MemoryStore. The whole two-persona
// flow runs once per width (1440, then 390) inside one test, because intros are shared server
// state: running it from both Playwright projects at once would race on the same alex/jordan pair.

const as = (handle: string) => ({ 'x-persona': handle });

async function reset(request: APIRequestContext) {
  for (const h of ['alex', 'jordan']) expect((await request.post('/api/intros/reset', { headers: as(h) })).ok()).toBe(true);
}

async function openAs(browser: Browser, handle: string, width: number): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 900 }, isMobile: width < 800, hasTouch: width < 800 });
  const page = await ctx.newPage();
  await page.goto(`/intros?as=${handle}`);
  await expect(page.getByRole('heading', { name: 'Intros from Muse' })).toBeVisible({ timeout: 20_000 });
  return page;
}

test.describe('Muse Intros', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'runs once; covers 1440 and 390 inside'); });

  test('round -> Jordan card -> both accept -> connected thread; dating request finds nobody', async ({ browser, request }) => {
    test.setTimeout(180_000);
    for (const width of [1440, 390]) {
      await reset(request);
      const alex = await openAs(browser, 'alex', width);
      await expect(alex.getByTestId('intro-card')).toHaveCount(0);

      await alex.getByTestId('run-round').click();
      const card = alex.locator('[data-testid="intro-card"][data-handle="jordan"]');
      await expect(card).toBeVisible({ timeout: 20_000 });
      await expect(card.getByTestId('trust-path').first()).toHaveText('You both know Maya');
      expect(await card.getByTestId('intro-reasons').locator('li').count()).toBeGreaterThanOrEqual(2);
      await expect(card).toContainText("Why your agents think you'd click");
      await expect(alex.getByTestId('round-result')).toContainText('considered but not a strong enough match');
      // Weak candidates are never shown as cards.
      await expect(alex.getByTestId('intro-card')).toHaveCount(1);
      for (const h of ['tess', 'ava', 'yuki']) await expect(alex.locator(`[data-testid="intro-card"][data-handle="${h}"]`)).toHaveCount(0);

      // Only alex's own agent's turns.
      await card.getByRole('button', { name: 'How your agents decided' }).click();
      await expect(card.getByTestId('agent-log')).toContainText("Alex's agent");
      await expect(card.getByTestId('agent-log')).not.toContainText("Jordan's agent here");

      await card.getByRole('button', { name: 'Accept' }).click();
      await expect(card.getByTestId('intro-status')).toHaveText('Waiting for Jordan');

      const jordan = await openAs(browser, 'jordan', width);
      const jCard = jordan.locator('[data-testid="intro-card"][data-handle="alex"]');
      await expect(jCard).toBeVisible();
      await expect(jCard).toHaveAttribute('data-state', 'new');
      await jCard.getByRole('button', { name: 'Accept' }).click();
      await expect(jCard.getByTestId('intro-status')).toHaveText("You're connected");
      await expect(jCard.getByRole('link', { name: 'Open chat' })).toBeVisible();

      // Alex's tab updates live (user:<id> {type:"intro"}).
      await expect(card.getByTestId('intro-status')).toHaveText("You're connected", { timeout: 10_000 });
      const href = await card.getByRole('link', { name: 'Open chat' }).getAttribute('href');
      const threadId = decodeURIComponent(href!.split('thread=')[1]);
      const msgs = await request.get(`/api/threads/${threadId}/messages`, { headers: as('alex') });
      expect(msgs.ok()).toBe(true);
      const body = await msgs.json() as { messages?: { text: string }[] } | { text: string }[];
      const list = Array.isArray(body) ? body : body.messages ?? [];
      expect(list.some((m) => m.text.startsWith('✨ Muse: '))).toBe(true);

      // On-request dating intro: nobody clears the bar.
      const ask = alex.getByTestId('ask-muse');
      await ask.getByRole('radio', { name: 'Dating' }).click();
      await ask.getByPlaceholder(/someone to try new restaurants/).fill('someone who loves live music');
      await ask.getByRole('button', { name: 'Ask Muse' }).click();
      await expect(ask.getByTestId('ask-answer')).toContainText('No great match yet', { timeout: 20_000 });
      await expect(alex.getByTestId('intro-card')).toHaveCount(1);

      await alex.screenshot({ path: `test-results/intros-${width}.png`, fullPage: true });
      await alex.context().close();
      await jordan.context().close();
    }
    await reset(request);
  });

  test('intro API is per viewer and validates input', async ({ request }) => {
    expect((await request.post('/api/intros/request', { headers: as('alex'), data: { kind: 'hookup' } })).status()).toBe(400);
    expect((await request.post('/api/intros/not-an-id/respond', { headers: as('alex'), data: { accept: true } })).status()).toBe(404);
    const prof = await request.get('/api/intros/profile', { headers: as('alex') });
    expect(prof.ok()).toBe(true);
    expect((await prof.json()).profile.kinds.friendship.on).toBe(true);
  });
});
