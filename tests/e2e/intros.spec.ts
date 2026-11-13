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
      await expect(card.getByTestId('first-step')).toContainText('Closet sale + try-ons');
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
      await expect(plan.getByTestId('muse-ask')).toContainText(/(Want me to hold 2 seats at|already going to) .*Closet sale \+ try-ons/);
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
      if (width === 1440) await expect(alex.getByTestId('muse-note')).toHaveCount(3);   // the opener, "Done, ... both going" and the exact spot
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

  // docs/DEMO_FLOW.md scenes 1-7, the closet sale: pass 1 has Alex at 1440 and Jordan at 390,
  // pass 2 swaps the widths, so every scene has a screenshot at both widths in .verify/thrift/.
  test('thrift story, scenes 1-7: Feed post, listing, plan area, 2-3 choices, Jordan says yes, exact spot, Go', async ({ browser, request }) => {
    test.setTimeout(300_000);
    const AREA = 'Belle Haven, near Ivy Dr';
    const SPOT = 'Courtyard by the bike racks, Willow Court Apartments';
    const shot = (p: Page, name: string) => p.screenshot({ path: `.verify/thrift/${name}.png` });
    const near = await (await request.get('/api/quests?radiusM=6000', { headers: as('alex') })).json() as {
      quests: { id: string; title: string; endsAt: string; approxLocation: { lat: number; lng: number } }[];
    };
    const q = near.quests.find((x) => x.title === 'Closet sale + try-ons')!;
    expect(q, 'seed has the closet sale plan').toBeTruthy();
    type Detail = { seatsLeft: number; viewerIsMember: boolean; meetSpot: string | null; areaLabel: string | null; walkMinutes: number | null; quest: { startsAt: string } };
    const detail = async (h: string) => (await (await request.get(`/api/quests/${q.id}`, { headers: as(h) })).json()) as Detail;
    const leahThread = async (h: string) => {
      const ts = await (await request.get('/api/threads', { headers: as(h) })).json() as { threads?: { id: string; members: { handle: string }[] }[] } | { id: string; members: { handle: string }[] }[];
      const list = Array.isArray(ts) ? ts : ts.threads ?? [];
      return list.find((t) => t.members.length === 2 && t.members.some((m) => m.handle === 'leah')) ?? null;
    };
    const museNotes = async (h: string, threadId: string) => {
      const msgs = await (await request.get(`/api/threads/${threadId}/messages`, { headers: as(h) })).json() as { messages?: { text: string; kind: string }[] } | { text: string; kind: string }[];
      return (Array.isArray(msgs) ? msgs : msgs.messages ?? []).filter((m) => m.kind === 'muse');
    };
    const open = async (handle: string, width: number, path: string) => {
      const ctx = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 900 }, isMobile: width < 800, hasTouch: width < 800 });
      const page = await ctx.newPage();
      await page.goto(path.includes('?') ? `${path}&as=${handle}` : `${path}?as=${handle}`);
      return page;
    };

    for (const [aw, jw] of [[1440, 390], [390, 1440]] as const) {
      await reset(request);
      for (const h of ['alex', 'jordan']) if ((await detail(h)).viewerIsMember) await request.post(`/api/quests/${q.id}/leave`, { headers: as(h), data: {} });
      // Jordan's seeded "I'm free" window covers the sale; post it again in case another test ended it.
      await request.post('/api/availability', {
        headers: as('jordan'),
        data: { text: 'around Belle Haven, down to browse a sale', startsAt: new Date().toISOString(), endsAt: q.endsAt, location: { lat: q.approxLocation.lat + 0.004, lng: q.approxLocation.lng } },
      });

      // Scene 1: Leah's closet sale post near the top of Alex's Feed, shared from Marketplace.
      const alex = await open('alex', aw, '/');
      const post = alex.locator('article').filter({ hasText: 'Closet sale today, come try stuff on' }).first();
      await expect(post).toBeVisible({ timeout: 30_000 });
      await post.scrollIntoViewIfNeeded();
      await expect(post.getByTestId('listing-share')).toContainText('View listing');
      await shot(alex, `scene1-feed-${aw}`);

      // Scene 2: the listing names the plan by its general area only.
      await post.getByTestId('listing-share').click();
      await expect(alex).toHaveURL(/\/marketplace\/[0-9a-f-]+/);
      const listing = alex.getByTestId('listing-page');
      await expect(listing.getByRole('heading', { level: 1 })).toContainText('Closet clean-out');
      await expect(listing.getByTestId('listing-seller')).toContainText('Leah Moreno');
      const planRow = listing.getByTestId('listing-plan');
      await expect(planRow).toContainText('Closet sale + try-ons');
      await expect(planRow).toContainText(AREA);
      await expect(listing).not.toContainText(SPOT);
      await shot(alex, `scene2-listing-${aw}`);

      // Scene 3: the plan on the map shows the area and the ~200 m pin, not the spot.
      await planRow.click();
      await expect(alex).toHaveURL(/\/out-here\?quest=/);
      const sheet = alex.getByTestId('quest-sheet');
      await expect(sheet).toContainText('Closet sale + try-ons', { timeout: 30_000 });
      await expect(sheet.getByTestId('quest-place')).toHaveText(AREA);
      await expect(sheet.getByTestId('quest-area-note')).toContainText('Muse shares the exact spot after you join');
      await expect(sheet).not.toContainText(SPOT);
      await expect(sheet.getByTestId('quest-host')).toContainText('Hosted by Leah Moreno');
      const before = await detail('alex');
      expect(before.meetSpot).toBeNull();
      expect(before.areaLabel).toBe(AREA);
      await shot(alex, `scene3-plan-area-${aw}`);

      // Scene 4: Alex says he's free; the mock Muse plan puts the closet sale first.
      const plan = await (await request.post('/api/muse/plan', { headers: as('alex'), data: { text: 'free for an hour, want someone into thrifting to go with' } })).json() as { suggestions: { questId: string | null }[] };
      expect(plan.suggestions[0]?.questId).toBe(q.id);
      await alex.goto(`/out-here/plan/${q.id}?as=alex`);
      await expect(alex.getByTestId('plan-place')).toHaveText(AREA, { timeout: 30_000 });
      const clock = await alex.getByTestId('plan-starts').locator('xpath=..').innerText();
      await shot(alex, `scene4-plan-page-${aw}`);

      // Scene 5: "Find someone to go with" offers 2 or 3 people, Jordan first, each with a why.
      await alex.getByTestId('plan-find-someone').click();
      await expect(alex).toHaveURL(new RegExp(`/intros\\?quest=${q.id}`));
      const ask = alex.getByTestId('ask-muse');
      await expect(ask.getByTestId('ask-plan')).toContainText(`Closet sale + try-ons at ${AREA}`, { timeout: 20_000 });
      await ask.getByLabel('What are you looking for?').fill('someone into thrifting to go with');
      await ask.getByRole('button', { name: 'Ask Muse' }).click();
      const choices = ask.getByTestId('intro-choice');
      await expect(choices.first()).toBeVisible({ timeout: 20_000 });
      const n = await choices.count();
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(3);
      await expect(choices.first()).toHaveAttribute('data-handle', 'jordan');
      await expect(choices.first()).toContainText('You both know Maya');
      await expect(choices.first()).toContainText('thrifting');
      await shot(alex, `scene5-choices-${aw}`);
      // A reload shows the same choices, once each, and none of them in the inbox.
      await alex.reload();
      await expect(ask.getByTestId('intro-choice')).toHaveCount(n, { timeout: 20_000 });
      await expect(alex.getByTestId('intro-card')).toHaveCount(0);
      // The intro start time is the plan page's, to the minute.
      const startClock = /(\d{1,2}:\d{2} [AP]M)/.exec(clock)![1];
      await expect(ask.getByTestId('ask-plan')).toContainText(startClock);
      await ask.getByTestId('intro-choice').first().getByTestId('pick-choice').click();
      const card = alex.locator('[data-testid="intro-card"][data-handle="jordan"]');
      await expect(card).toBeVisible({ timeout: 20_000 });
      await expect(card.getByTestId('first-step')).toContainText('Closet sale + try-ons');
      await expect(card.getByTestId('first-step-when')).toContainText(startClock);
      await expect(card.getByTestId('intro-status')).toHaveText('Waiting for Jordan');
      await expect(alex.getByTestId('intro-card')).toHaveCount(1);

      // Scene 6: Jordan gets the intro and says yes.
      const jordan = await open('jordan', jw, '/intros');
      const jcard = jordan.locator('[data-testid="intro-card"][data-handle="alex"]');
      await expect(jcard).toBeVisible({ timeout: 20_000 });
      await expect(jcard.getByTestId('intro-join-line')).toContainText('Saying yes adds you to 🧥 Closet sale + try-ons');
      await expect(jcard.getByTestId('first-step')).not.toContainText('pregame');
      await shot(jordan, `scene6-jordan-card-${jw}`);
      await jcard.getByRole('button', { name: 'Yes, go together' }).click();
      await expect(jcard.getByTestId('intro-status')).toHaveText("You're connected", { timeout: 20_000 });

      // Scene 7: both are on the plan; each card has the exact spot, the walk and Go.
      for (const h of ['alex', 'jordan']) expect((await detail(h)).viewerIsMember).toBe(true);
      const after = await detail('alex');
      expect(after.meetSpot).toBe(SPOT);
      await expect(card.getByTestId('intro-status')).toHaveText("You're connected", { timeout: 10_000 });
      for (const [p, c, h] of [[alex, card, 'alex'], [jordan, jcard, 'jordan']] as const) {
        const reveal = c.getByTestId('intro-reveal');
        await expect(reveal).toContainText(`Exact spot: ${SPOT}`, { timeout: 10_000 });
        const walk = (await detail(h)).walkMinutes!;
        await expect(reveal).toContainText(`${walk} min walk for you`);
        await expect(c.getByTestId('intro-go')).toHaveText(`Go · ${walk} min walk`);
        await c.getByTestId('intro-reveal').scrollIntoViewIfNeeded();
        await shot(p, `scene7-connected-${h}-${h === 'alex' ? aw : jw}`);
        // Muse's note in each one's chat with Leah has the exact spot and the same start time.
        const t = await leahThread(h);
        expect(t, `${h} has a chat with Leah`).toBeTruthy();
        const notes = await museNotes(h, t!.id);
        expect(notes.some((m) => m.text.includes(`Exact spot: ${SPOT}`) && m.text.includes(`at ${startClock}.`))).toBe(true);
      }
      const t = await leahThread('alex');
      await alex.goto(`/messages?thread=${encodeURIComponent(t!.id)}&as=alex`);
      await expect(alex.getByTestId('muse-note').filter({ hasText: SPOT }).first()).toBeVisible({ timeout: 20_000 });
      await shot(alex, `scene7-muse-spot-chat-${aw}`);
      // Go starts the walk (3D), or opens the plan on the 2D map where WebGL is missing.
      await alex.goBack();
      await alex.goto('/intros?as=alex');
      await alex.locator('[data-testid="intro-card"][data-handle="jordan"]').getByTestId('intro-go').click();
      await expect(alex).toHaveURL(/\/out-here/);
      await expect(alex.getByTestId('walk-countdown').or(alex.getByTestId('quest-sheet'))).toBeVisible({ timeout: 30_000 });
      await shot(alex, `scene7-go-${aw}`);

      for (const h of ['alex', 'jordan']) expect((await request.post(`/api/quests/${q.id}/leave`, { headers: as(h), data: {} })).ok()).toBe(true);
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
