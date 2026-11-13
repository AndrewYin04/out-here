import { expect, test } from '@playwright/test';

// Nothing posted fits, a friend is free: Muse drafts a plan for you two and one tap makes it.
// The server's clock decides which places are open, so the plan answer and the draft are stubbed
// here; tests/unit/draft-hang*.test.ts cover the real route and the place rules.
test('Muse drafts a plan with a free friend when nothing fits, and Make this plan creates it', async ({ page }) => {
  const iso = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
  await page.route('**/api/muse/plan', (r) => r.fulfill({
    json: {
      intent: { activities: ['food'], budgetMax: 15, windowStart: iso(0), windowEnd: iso(120), maxWalkMinutes: null, wantsFriends: true, openToNewPeople: true, vibe: null },
      suggestions: [], summary: 'Nothing posted nearby fits your 2 hours right now. But Maya is free too.',
      meta: { mode: 'live', source: 'muse', contextSource: 'store', dropped: [], friendsChecked: 6, friendsFree: [{ firstName: 'Maya', freeUntil: iso(100) }] },
    },
  }));
  let draftBody: Record<string, unknown> | null = null;
  await page.route('**/api/muse/draft-hang', (r) => {
    draftBody = r.request().postDataJSON();
    return r.fulfill({ json: { mode: 'live', friend: { id: 'f-maya', name: 'Maya Chen', avatarUrl: '', handle: 'maya' }, draft: {
      friendId: 'f-maya', title: 'Dumplings before the rush', emoji: '🥟', category: 'food', description: 'Grab dumplings.',
      placeId: 'p-dumpling', venueName: 'Dumpling Den', location: { lat: 37.48, lng: -122.15 }, startsAt: iso(10), endsAt: iso(70),
      priceMax: 12, myWalk: 9, theirWalk: 10, pitch: 'You both like dumplings.', invite: 'Dumpling Den in 10?' } } });
  });
  let created: Record<string, unknown> | null = null;
  await page.route('**/api/quests', (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    created = r.request().postDataJSON();
    return r.fulfill({ json: { quest: { id: 'q-new' } } });
  });

  await page.goto('/out-here?as=alex&view=map');
  await page.getByTestId('im-free').click({ timeout: 45_000 });
  await page.locator('#imfree-text').fill('hungry, under $15');
  await page.getByRole('button', { name: 'Find a plan' }).click();

  const card = page.getByTestId('draft-hang');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('plan-empty')).toHaveCount(0);
  await expect(page.getByTestId('draft-hang-title')).toHaveText('Dumplings before the rush');
  await expect(page.getByTestId('draft-hang-invite')).toContainText('Dumpling Den in 10?');
  await expect(card.getByTestId('muse-label')).toBeVisible();
  expect(draftBody).toMatchObject({ text: 'hungry, under $15', budgetMax: 15 });

  await page.getByTestId('draft-hang-make').click();
  await expect(card).toHaveAttribute('data-state', 'made');
  await expect(card).toContainText('Maya’s invited');
  await expect(page.getByTestId('draft-hang-go')).toBeVisible();
  expect(created).toMatchObject({ visibility: 'friends', inviteIds: ['f-maya'], inviteMessage: 'Dumpling Den in 10?', placeId: 'p-dumpling', venueName: 'Dumpling Den' });
});
