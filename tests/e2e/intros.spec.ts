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
      // Review P1: before Jordan says yes, nothing tells Alex what Jordan (or Jordan's agent) asked for.
      await expect(card.getByTestId('intro-reasons')).not.toContainText(/agent|was looking for|something similar/);
      await alex.screenshot({ path: `.verify/intros/intros-alex-new-${width}.png` });
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
      await expect(jCard.getByTestId('intro-reasons')).not.toContainText(/agent|was looking for|something similar/);
      expect(await jCard.getByTestId('intro-reasons').locator('li').count()).toBeGreaterThanOrEqual(2);
      await jordan.screenshot({ path: `.verify/intros/intros-jordan-new-${width}.png` });
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

      // Review P3: Muse's ask has quick replies on both cards. Hold seats joins both to the quest.
      const plan = card.getByTestId('muse-plan');
      await expect(plan).toBeVisible();
      await expect(plan.getByTestId('muse-ask')).toContainText(/Want me to hold (2 seats|a seat for \w+ \(\w+ is already going\)) at .*Local-band show pregame/);
      await expect(jCard.getByTestId('muse-plan')).toBeVisible();
      const stepHref = await card.getByRole('link', { name: 'Plan it together' }).getAttribute('href');
      const questId = decodeURIComponent(stepHref!.split('quest=')[1]);
      const memberBefore: Record<string, boolean> = {};
      for (const h of ['alex', 'jordan']) {
        memberBefore[h] = (await (await request.get(`/api/quests/${questId}`, { headers: as(h) })).json() as { viewerIsMember: boolean }).viewerIsMember;
      }
      if (width === 1440) {
        await card.getByTestId('hold-seats').click();
        await expect(card.getByTestId('seats-held')).toContainText('Seats held for you and Jordan');
        await expect(jCard.getByTestId('seats-held')).toContainText('Seats held for you and Alex', { timeout: 10_000 });
        for (const h of ['alex', 'jordan']) {
          expect((await (await request.get(`/api/quests/${questId}`, { headers: as(h) })).json() as { viewerIsMember: boolean }).viewerIsMember).toBe(true);
        }
      } else {
        await card.getByTestId('pick-time').click();
        await expect(card.getByTestId('plan-options').getByTestId('plan-option').first()).toBeVisible();
      }
      await card.scrollIntoViewIfNeeded();
      await alex.screenshot({ path: `.verify/intros/intros-alex-plan-${width}.png` });
      await jordan.screenshot({ path: `.verify/intros/intros-jordan-plan-${width}.png` });

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
      const museNote = alex.getByTestId('muse-note').first();
      await expect(museNote).toBeVisible({ timeout: 20_000 });
      await expect(museNote).toContainText('✨ Muse');
      await expect(museNote).toContainText('Alex, meet Jordan. Jordan, meet Alex.');
      await expect(museNote).toContainText(/Want me to hold (2 seats|a seat for \w+ \(\w+ is already going\)) at .+\((Starts in \d+ min|Today|Tomorrow|Happening now)/);
      // Muse is the third person in the chat, by name.
      await expect(alex.getByTestId('conversation-title').first()).toHaveText('Alex, Jordan + Muse');
      if (width === 1440) await expect(alex.getByTestId('muse-note')).toHaveCount(2);   // the opener + "Done, ... both going"
      await expect(alex.getByTestId('bubble-theirs')).toHaveCount(0);
      await alex.screenshot({ path: `.verify/intros/intros-chat-${width}.png` });
      // Put the quest back the way the seed had it, so the 390 pass (and reruns) start the same.
      for (const h of ['alex', 'jordan']) {
        if (!memberBefore[h]) expect((await request.post(`/api/quests/${questId}/leave`, { headers: as(h), data: {} })).ok()).toBe(true);
      }
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

  test('plan-anchored: Alex asks for someone to go to a plan with, Jordan accepts, both are on it', async ({ browser, request }) => {
    test.setTimeout(180_000);
    // Scene 5: the seeded comics open house, asked for with the scripted line.
    const near = await (await request.get('/api/quests?radiusM=6000', { headers: as('alex') })).json() as {
      quests: { id: string; title: string; startsAt: string; endsAt: string; approxLocation: { lat: number; lng: number }; capacity: number; memberIds: string[] }[];
    };
    const q = near.quests.find((x) => x.title === 'Comics open house')!;
    expect(q, 'seed has the Comics open house plan').toBeTruthy();
    const detail = async (h: string) => (await (await request.get(`/api/quests/${q.id}`, { headers: as(h) })).json()) as { seatsLeft: number; viewerIsMember: boolean };
    for (const width of [1440, 390]) {
      await reset(request);
      for (const h of ['alex', 'jordan']) if ((await detail(h)).viewerIsMember) await request.post(`/api/quests/${q.id}/leave`, { headers: as(h), data: {} });
      // Jordan is free tonight, a short walk from the plan.
      expect((await request.post('/api/availability', {
        headers: as('jordan'),
        data: { text: 'free tonight', startsAt: new Date().toISOString(), endsAt: q.endsAt, location: q.approxLocation },
      })).ok()).toBe(true);
      const seatsBefore = (await detail('alex')).seatsLeft;

      // Entry point on the plan page, then the pre-filled ask.
      const ctx = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 900 }, isMobile: width < 800, hasTouch: width < 800 });
      const alex = await ctx.newPage();
      await alex.goto(`/out-here/plan/${q.id}?as=alex`);
      const entry = alex.getByTestId('plan-find-someone');
      await expect(entry).toBeVisible({ timeout: 20_000 });
      await alex.screenshot({ path: `.verify/event-intro/entry-plan-page-${width}.png` });
      await entry.click();
      await expect(alex).toHaveURL(new RegExp(`/intros\\?quest=${q.id}`));
      const ask = alex.getByTestId('ask-muse');
      await expect(ask.getByTestId('ask-plan')).toContainText('Comics open house', { timeout: 20_000 });
      await expect(ask.getByRole('heading', { name: 'Find someone to go with' })).toBeVisible();
      // For a plan Muse tries every kind Alex has on, so there is no kind to pick.
      await expect(ask.getByRole('radio', { name: 'Coffee chat' })).toHaveCount(0);
      await ask.getByLabel('What are you looking for?').fill('someone who likes comics');
      await alex.screenshot({ path: `.verify/event-intro/prefilled-${width}.png` });
      await ask.getByRole('button', { name: 'Ask Muse' }).click();
      await expect(ask.getByTestId('ask-answer')).toContainText('meet Jordan', { timeout: 20_000 });

      const card = alex.locator('[data-testid="intro-card"][data-handle="jordan"]');
      await expect(card).toBeVisible();
      await expect(card.getByTestId('first-step-title')).toHaveText('The plan');
      await expect(card.getByTestId('first-step')).toContainText('Comics open house');
      await expect(card.getByRole('link', { name: 'See on map' })).toHaveAttribute('href', `/out-here?quest=${q.id}`);
      await expect(card.getByTestId('intro-reasons').locator('li').first()).toContainText('📚 Comics open house');
      await expect(card.getByTestId('intro-join-line')).toContainText('Saying yes adds you to 📚 Comics open house');
      await card.getByRole('button', { name: 'Yes, go together' }).click();
      await expect(card.getByTestId('intro-status')).toHaveText('Waiting for Jordan');
      expect((await detail('alex')).viewerIsMember).toBe(false);

      // Jordan's card: the plan, the time and the walk are above the fold before he decides.
      const jctx = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 900 }, isMobile: width < 800, hasTouch: width < 800 });
      const jp = await jctx.newPage();
      await jp.goto('/intros?as=jordan');
      const jcard = jp.locator('[data-testid="intro-card"][data-handle="alex"]');
      await expect(jcard).toBeVisible({ timeout: 20_000 });
      await expect(jcard.getByRole('button', { name: 'Yes, go together' })).toBeInViewport();
      await expect(jcard.getByTestId('intro-join-line')).toBeInViewport();
      await expect(jcard.getByTestId('intro-join-line')).toContainText('Saying yes adds you to 📚 Comics open house');
      await expect(jcard.getByTestId('first-step')).toContainText('Comics open house');
      await jp.screenshot({ path: `.verify/event-intro/jordan-card-${width}.png` });
      await jctx.close();

      // Jordan says yes from the API; both join on that yes.
      const list = await (await request.get('/api/intros', { headers: as('jordan') })).json() as { intros: { id: string; other: { handle: string } }[] };
      const mine = list.intros.find((i) => i.other.handle === 'alex')!;
      const res = await request.post(`/api/intros/${mine.id}/respond`, { headers: as('jordan'), data: { accept: true } });
      expect(res.ok()).toBe(true);
      expect(((await res.json()) as { intro: { state: string } }).intro.state).toBe('connected');
      expect((await detail('alex')).viewerIsMember).toBe(true);
      expect((await detail('jordan')).viewerIsMember).toBe(true);
      expect((await detail('alex')).seatsLeft).toBe(seatsBefore - 2);

      // Alex's card updates live and shows the plan, held, with the map link.
      await expect(card.getByTestId('intro-status')).toHaveText("You're connected", { timeout: 10_000 });
      await expect(card.getByTestId('seats-held')).toContainText('Seats held for you and Jordan');
      await expect(card.getByTestId('first-step')).toContainText('Comics open house');
      await expect(card.getByRole('link', { name: 'See on map' })).toBeVisible();
      const href = await card.getByRole('link', { name: 'Open chat' }).getAttribute('href');
      const threadId = decodeURIComponent(href!.split('thread=')[1]);
      const msgs = await (await request.get(`/api/threads/${threadId}/messages`, { headers: as('alex') })).json() as { messages?: { text: string; kind: string }[] } | { text: string; kind: string }[];
      const notes = (Array.isArray(msgs) ? msgs : msgs.messages ?? []).filter((m) => m.kind === 'muse');
      expect(notes).toHaveLength(1);
      expect(notes[0].text).toContain("You're both going to 📚 Comics open house");
      expect(notes[0].text).toMatch(/about a \d+ min walk for Alex and \d+ min for Jordan/);
      await card.scrollIntoViewIfNeeded();
      await alex.screenshot({ path: `.verify/event-intro/connected-${width}.png` });

      // The quest panel on the map has the same entry point.
      await alex.goto(`/out-here?quest=${q.id}`);
      const panelEntry = alex.getByTestId('quest-find-someone');
      await expect(panelEntry).toBeVisible({ timeout: 30_000 });
      await expect(panelEntry).toHaveAttribute('href', `/intros?quest=${q.id}`);
      await panelEntry.scrollIntoViewIfNeeded();
      await alex.screenshot({ path: `.verify/event-intro/entry-quest-panel-${width}.png` });

      for (const h of ['alex', 'jordan']) expect((await request.post(`/api/quests/${q.id}/leave`, { headers: as(h), data: {} })).ok()).toBe(true);
      await ctx.close();
    }
    await request.delete('/api/availability', { headers: as('jordan') });
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
