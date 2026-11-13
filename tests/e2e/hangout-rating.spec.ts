import { expect, test, type Page } from '@playwright/test';

// Post-hangout rating (docs/HANGOUT_RATINGS.md): Alex taps "We're done" and rates the hangout
// (verdict, "Which was better?", highlights + photo, hang again); Maya opens the "How was it?"
// notification and rates it too. Screenshots of each step go to .verify/ratings/.
test('two attendees complete a hangout and rate it', async ({ page, browser, request }, testInfo) => {
  const project = testInfo.project.name;
  const phone = project === 'phone';
  const viewport = phone ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  await page.setViewportSize(viewport);
  const shot = (p: Page, step: string) => p.screenshot({ path: `.verify/ratings/${project}-${step}.png` });
  const as = (persona: string) => ({ 'x-persona': persona });
  const now = Date.now();
  const title = `Rating test ${project} ${now}`;
  const created = await request.post('/api/quests', {
    headers: as('alex'),
    data: {
      title, category: 'food', venueName: 'Test courtyard', location: { lat: 37.4847, lng: -122.1477 },
      startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 600_000).toISOString(), capacity: 3,
      isPublic: false,
    },
  });
  expect(created.ok()).toBeTruthy();
  const { quest } = await created.json();
  expect((await request.post(`/api/quests/${quest.id}/join`, { headers: as('maya'), data: {} })).ok()).toBeTruthy();

  // Before anyone rates: an outsider cannot read the questionnaire or the recap.
  expect([403, 404]).toContain((await request.get(`/api/quests/${quest.id}/rating`, { headers: as('jordan') })).status());
  expect([403, 404]).toContain((await request.get(`/api/quests/${quest.id}/recap`, { headers: as('jordan') })).status());

  // ---- Alex: "We're done" opens the questionnaire ----
  await page.goto('/events?tab=going&as=alex');
  const card = page.getByRole('article', { name: title });
  await card.getByRole('button', { name: 'We’re done' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rate your hangout' });
  await expect(dialog.getByRole('heading', { name: 'How was it?' })).toBeVisible();
  // One photo uploader on screen: the card's own photo form stays closed behind the dialog.
  await expect(page.getByRole('button', { name: 'Close photo form' })).toHaveCount(0);
  await shot(page, '1-verdict');
  await dialog.getByRole('button', { name: 'Loved it' }).click();

  // Alex has seeded "loved" ratings, so placement asks at most 3 times.
  await expect(dialog.getByRole('heading', { name: 'Which was better?' })).toBeVisible();
  await shot(page, '2-compare');
  let asked = 0;
  while (await dialog.getByRole('heading', { name: 'Which was better?' }).isVisible()) {
    // Better than the first past hangout, worse than any later one.
    const pick = asked === 0 ? /This hangout/ : /You gave it/;
    await dialog.getByRole('button', { name: pick }).click();
    asked++;
    expect(asked).toBeLessThanOrEqual(3);
  }

  await expect(dialog.getByRole('heading', { name: 'What stood out?' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Good food' }).click();
  await dialog.getByRole('button', { name: 'Great conversation' }).click();
  await dialog.getByLabel('Private note (optional)').fill('Try the chili oil next time.');
  // The photo step is a dashed tile over a hidden input: a pick uploads at once, no caption form.
  await expect(dialog.getByTestId('add-photos-tile')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save to crew album' })).toHaveCount(0);
  await dialog.getByLabel('Take a photo together').setInputFiles('public/seed/groups/boba-and-sketch.webp');
  await expect(dialog.getByRole('list', { name: 'Photos you added' }).getByRole('img')).toHaveCount(1);
  const thumb = dialog.getByRole('list', { name: 'Photos you added' }).getByRole('img');
  await expect.poll(() => thumb.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await shot(page, '3-details');
  await dialog.getByRole('button', { name: 'Next' }).click();

  await expect(dialog.getByRole('heading', { name: 'Hang out with them again?' })).toBeVisible();
  await expect(dialog).toContainText('Only Muse sees this.');
  await dialog.getByRole('group', { name: 'Hang out with Maya again?' }).getByRole('button', { name: 'Yes' }).click();
  await shot(page, '4-again');
  await dialog.getByRole('button', { name: 'Save rating' }).click();

  await expect(dialog.getByText('Saved. Muse will use this next time.')).toBeVisible();
  const alexScore = Number(await dialog.getByTestId('rating-score').textContent());
  expect(alexScore).toBeGreaterThanOrEqual(6.7);
  expect(alexScore).toBeLessThanOrEqual(10);
  await expect(dialog.getByTestId('rating-rank')).toHaveText(/^\d\.\d, your #\d+ hangout/);
  // The Muse line comes from the answers: the chips picked and the person marked yes.
  await expect(dialog.getByTestId('rating-takeaway')).toContainText("Next time I'll look for good food and great conversation like this, with Maya.");
  await shot(page, '5-done');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(card.getByRole('button', { name: `Edit rating (${alexScore.toFixed(1)})` })).toBeVisible();
  // Finished state: the score and the photo from the dialog, no open photo form.
  await expect(card.getByTestId('plan-rating')).toContainText(`You rated it ${alexScore.toFixed(1)}`);
  await expect(card.getByRole('list', { name: 'Photos from your rating' }).getByRole('img')).toHaveCount(1);
  await expect(card.getByRole('button', { name: 'Close photo form' })).toHaveCount(0);
  await shot(page, '5b-card-after');

  // ---- Maya: the "How was it?" notification opens the questionnaire ----
  const mayaContext = await browser.newContext({ viewport });
  try {
    const maya = await mayaContext.newPage();
    await maya.goto('/notifications?as=maya');
    const row = maya.getByTestId('notification-row').filter({ hasText: `Rate ${title}` });
    await expect(row).toHaveAttribute('data-href', `/memories?rate=${quest.id}`);
    await shot(maya, '0-notification');
    // An invite toast from another test can sit over the list; the row's own click handler is what is under test.
    await row.dispatchEvent('click');
    await expect(maya).toHaveURL(new RegExp(`/memories\\?rate=${quest.id}`));
    const md = maya.getByRole('dialog', { name: 'Rate your hangout' });
    await md.getByRole('button', { name: 'It was fine' }).click();
    if (await md.getByRole('heading', { name: 'Which was better?' }).isVisible()) await md.getByRole('button', { name: 'Skip' }).click();
    await md.getByRole('button', { name: 'Good food' }).click();
    await md.getByRole('button', { name: 'Next' }).click();
    await md.getByRole('group', { name: 'Hang out with Alex again?' }).getByRole('button', { name: 'Yes' }).click();
    await md.getByRole('button', { name: 'Save rating' }).click();
    await expect(md.getByTestId('rating-score')).toHaveText('5.0');
    await md.getByRole('button', { name: 'Done' }).click();
    await expect(maya).not.toHaveURL(/rate=/);
    const crewCard = maya.getByRole('region', { name: `${title} crew` });
    await expect(crewCard.getByTestId('crew-rating')).toContainText('You rated it 5.0');
    await crewCard.getByRole('button', { name: 'Edit rating' }).click();
    await expect(maya.getByRole('dialog', { name: 'Rate your hangout' })).toContainText('You rated this 5.0');
    await shot(maya, '6-edit-from-memories');
    // Changing to "Not for me" demotes the regroup button on the crew card.
    const ed = maya.getByRole('dialog', { name: 'Rate your hangout' });
    await ed.getByRole('button', { name: 'Not for me' }).click();
    if (await ed.getByRole('heading', { name: 'Which was better?' }).isVisible()) await ed.getByRole('button', { name: 'Skip' }).click();
    await ed.getByRole('button', { name: 'Next' }).click();
    await ed.getByRole('button', { name: 'Save rating' }).click();
    await expect(ed.getByTestId('rating-takeaway')).toContainText('Got it.');
    await ed.getByRole('button', { name: 'Done' }).click();
    await expect(crewCard.getByTestId('regroup-demoted')).toBeVisible();
    await expect(crewCard.getByRole('link', { name: 'Find a different plan' })).toBeVisible();
    await expect(crewCard.getByRole('button', { name: 'Get this group together again' })).toHaveCount(0);
    await shot(maya, '7-memories-after-meh');
  } finally {
    await mayaContext.close();
  }

  // ---- Recap (for Ally): counts and chips, no hang-again answers, no other rater's note ----
  const recapRes = await request.get(`/api/quests/${quest.id}/recap`, { headers: as('maya') });
  expect(recapRes.ok()).toBeTruthy();
  const recap = await recapRes.json();
  expect(recap.ratedCount).toBe(2);
  // k-anonymity: with fewer than 3 other raters, no verdict counts; only chips everyone picked.
  expect(recap.countsHidden).toBe(true);
  expect(recap.verdicts).toBeNull();
  expect(recap.highlights).toEqual([{ label: 'good food', count: 2 }]);
  expect(recap.photos).toHaveLength(1);
  const alexRecap = await (await request.get(`/api/quests/${quest.id}/recap`, { headers: as('alex') })).json();
  expect(alexRecap.verdicts).toBeNull();
  expect(alexRecap.highlights.map((h: { label: string }) => h.label)).toEqual(['good food']);
  const text = JSON.stringify(recap);
  expect(text).not.toContain('chili oil');
  expect(text).not.toMatch(/subjectId|"again"/);
  const state = await (await request.get(`/api/quests/${quest.id}/rating`, { headers: as('maya') })).json();
  expect(JSON.stringify(state)).not.toContain('chili oil');
  expect(state.again).toEqual([{ subjectId: expect.any(String), again: true }]);
  const mine = await (await request.get('/api/me/ratings', { headers: as('alex') })).json();
  expect(mine.ratings.find((r: { questId: string }) => r.questId === quest.id).photoIds).toHaveLength(1);
});
