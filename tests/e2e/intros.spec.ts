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

      // The main action is on the first screen, under the name.
      await expect(card.getByRole('button', { name: 'Accept' })).toBeInViewport();
      // Reasons talk to alex as "you" and never quote Jordan's private settings.
      await expect(card.getByTestId('intro-reasons')).not.toContainText('Alex');
      await expect(card.getByTestId('intro-reasons')).not.toContainText('gig nights');
      await expect(card.getByTestId('first-step')).toContainText('Local-band show pregame');
      await expect(card.getByRole('link', { name: 'See on map' })).toHaveAttribute('href', /^\/out-here\?quest=/);

      // Both agents' turns, interleaved; Jordan's agent's words stay private (outcome only).
      await card.getByRole('button', { name: 'How your agents decided' }).click();
      const log = card.getByTestId('agent-log');
      await expect(log).toContainText('Your agent');
      await expect(log.getByTestId('agent-turn-mine')).toHaveCount(2);
      await expect(log.getByTestId('agent-turn-theirs')).toHaveCount(2);
      // The other agent's turn shows only its decision, never its words. Mock wording is fixed; real Muse varies.
      await expect(log.getByTestId('agent-turn-theirs').first()).toContainText("Jordan's agent (private)");
      if (process.env.MUSE_MOCK === '1') await expect(log.getByTestId('agent-turn-theirs').first()).toContainText('asked about timing');
      await expect(log).not.toContainText("Jordan's agent here");
      await expect(log.getByTestId('judge-line')).toContainText(/(8[5-9]|9\d|100)\/100, above the 85 bar/);

      // Jordan hears nothing before alex says yes.
      const before = await (await request.get('/api/intros', { headers: as('jordan') })).json() as { intros: unknown[] };
      expect(before.intros).toHaveLength(0);

      await card.getByRole('button', { name: 'Accept' }).click();
      await expect(card.getByTestId('intro-status')).toHaveText('Waiting for Jordan');

      // Now Muse asks Jordan, with a notification that links to the card.
      const notes = await (await request.get('/api/notifications', { headers: as('jordan') })).json() as { notifications: { type: string; href: string; text: string }[] };
      const note = notes.notifications.find((n) => n.type === 'intro');
      expect(note?.text).toContain('meet Alex');
      expect(note?.href).toMatch(/^\/intros#/);
      // A rehearsal reset leaves no duplicate: exactly one intro notification on every pass.
      expect(notes.notifications.filter((n) => n.type === 'intro')).toHaveLength(1);

      const jordan = await openAs(browser, 'jordan', width);
      const jCard = jordan.locator('[data-testid="intro-card"][data-handle="alex"]');
      await expect(jCard).toBeVisible();
      await expect(jCard).toHaveAttribute('data-state', 'new');
      await expect(jCard).toContainText('Alex already said yes');
      await expect(jCard.getByTestId('intro-reasons')).not.toContainText('Jordan');
      await expect(jCard.getByRole('button', { name: 'Accept' })).toBeInViewport();
      await jCard.getByRole('button', { name: 'Accept' }).click();
      await expect(jCard.getByTestId('intro-status')).toHaveText("You're connected");
      await expect(jCard.getByRole('link', { name: 'Open chat' })).toBeVisible();

      // Alex's tab updates live (user:<id> {type:"intro"}).
      await expect(card.getByTestId('intro-status')).toHaveText("You're connected", { timeout: 10_000 });
      const href = await card.getByRole('link', { name: 'Open chat' }).getAttribute('href');
      const threadId = decodeURIComponent(href!.split('thread=')[1]);
      const msgs = await request.get(`/api/threads/${threadId}/messages`, { headers: as('alex') });
      expect(msgs.ok()).toBe(true);
      const body = await msgs.json() as { messages?: { text: string; kind: string }[] } | { text: string; kind: string }[];
      const list = Array.isArray(body) ? body : body.messages ?? [];
      expect(list.filter((m) => m.kind === 'muse' && m.text.startsWith('✨ Muse: '))).toHaveLength(1);

      // On-request dating intro: nobody clears the bar.
      const ask = alex.getByTestId('ask-muse');
      await ask.getByRole('radio', { name: 'Dating' }).click();
      await ask.getByPlaceholder(/someone to try new restaurants/).fill('someone who loves live music');
      await ask.getByRole('button', { name: 'Ask Muse' }).click();
      await expect(ask.getByTestId('ask-answer')).toContainText('No great match yet', { timeout: 20_000 });
      await expect(alex.getByTestId('intro-card')).toHaveCount(1);

      // Intro settings live behind the gear: switches and miles.
      await alex.getByTestId('open-intro-settings').click();
      const sheet = alex.getByRole('dialog', { name: 'Intro settings' });
      await expect(sheet.getByRole('switch', { name: 'Friendship' })).toHaveAttribute('aria-checked', 'true');
      await expect(sheet.getByRole('switch', { name: 'Pause intros' })).toHaveAttribute('aria-checked', 'false');
      await expect(sheet.getByLabel('Max distance in miles')).toHaveValue('15');
      await alex.screenshot({ path: `.verify/intros/intros-settings-${width}.png` });
      await alex.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);

      await alex.screenshot({ path: `.verify/intros/intros-${width}.png`, fullPage: true });
      await jordan.screenshot({ path: `.verify/intros/intros-jordan-${width}.png` });

      // Open chat: Muse's note is a centred card from Muse, addressed to both, not a bubble from Jordan.
      await card.getByRole('link', { name: 'Open chat' }).click();
      await expect(alex).toHaveURL(/\/messages\?thread=/);
      const museNote = alex.getByTestId('muse-note');
      await expect(museNote).toBeVisible({ timeout: 20_000 });
      await expect(museNote).toContainText('✨ Muse');
      await expect(museNote).toContainText('Alex, meet Jordan. Jordan, meet Alex.');
      await expect(museNote).toContainText(/First step idea: .+\((Starts in \d+ min|Today|Tomorrow|Happening now)/);
      await expect(alex.getByTestId('bubble-theirs')).toHaveCount(0);
      await alex.screenshot({ path: `.verify/intros/intros-chat-${width}.png` });
      await alex.context().close();
      await jordan.context().close();
    }
    await reset(request);
  });

  test('a decline is silent: the person who said yes keeps waiting', async ({ request }) => {
    await reset(request);
    const run = await (await request.post('/api/intros/run', { headers: as('alex'), data: {} })).json() as { intro: { id: string } | null };
    const id = run.intro!.id;
    expect((await request.post(`/api/intros/${id}/respond`, { headers: as('alex'), data: { accept: true } })).ok()).toBe(true);
    expect((await request.post(`/api/intros/${id}/respond`, { headers: as('jordan'), data: { accept: false } })).ok()).toBe(true);
    const a = await (await request.get('/api/intros', { headers: as('alex') })).json() as { intros: { id: string; state: string; closedText: string | null }[] };
    const mine = a.intros.find((i) => i.id === id)!;
    expect(mine.state).toBe('waiting');
    expect(mine.closedText).toBeNull();
    const j = await (await request.get('/api/intros', { headers: as('jordan') })).json() as { intros: { id: string; closedText: string | null }[] };
    expect(j.intros.find((i) => i.id === id)!.closedText).toBe('You passed on this intro');
    await reset(request);
  });

  test('two accepts at once (a double click) connect once, with one Muse note', async ({ request }) => {
    await reset(request);
    const run = await (await request.post('/api/intros/run', { headers: as('alex'), data: {} })).json() as { intro: { id: string } | null };
    const id = run.intro!.id;
    const respond = (h: string) => request.post(`/api/intros/${id}/respond`, { headers: as(h), data: { accept: true } });
    const aClicks = await Promise.all([respond('alex'), respond('alex')]);
    expect(aClicks.every((r) => r.ok())).toBe(true);
    const notes = await (await request.get('/api/notifications', { headers: as('jordan') })).json() as { notifications: { type: string }[] };
    expect(notes.notifications.filter((n) => n.type === 'intro')).toHaveLength(1);
    const bClicks = await Promise.all([respond('jordan'), respond('jordan')]);
    const cards = await Promise.all(bClicks.map(async (r) => (await r.json()) as { intro: { state: string; threadId: string | null } }));
    expect(cards.map((c) => c.intro.state)).toEqual(['connected', 'connected']);
    const a = await (await request.get('/api/intros', { headers: as('alex') })).json() as { intros: { id: string; threadId: string | null }[] };
    const threadId = a.intros.find((i) => i.id === id)!.threadId!;
    const msgs = await (await request.get(`/api/threads/${threadId}/messages`, { headers: as('alex') })).json() as { messages?: { kind: string }[] } | { kind: string }[];
    const list = Array.isArray(msgs) ? msgs : msgs.messages ?? [];
    expect(list.filter((m) => m.kind === 'muse')).toHaveLength(1);
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
