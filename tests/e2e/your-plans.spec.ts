import { expect, test } from '@playwright/test';

test('two attendees can find a joined hangout and share one crew album', async ({ page, browser, request }, testInfo) => {
  const as = (persona: string) => ({ 'x-persona': persona });
  const now = Date.now();
  const title = `Crew photo test ${testInfo.project.name} ${now}`;
  const created = await request.post('/api/quests', {
    headers: as('alex'),
    data: {
      title, category: 'art', venueName: 'Test courtyard', location: { lat: 37.4847, lng: -122.1477 },
      startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 600_000).toISOString(), capacity: 3,
      isPublic: false,
    },
  });
  expect(created.ok()).toBeTruthy();
  const { quest } = await created.json();

  await page.goto('/out-here?as=alex');
  await page.getByRole('link', { name: 'Your plans' }).click();
  const alexPlan = page.getByRole('article', { name: title });
  await expect(alexPlan).toBeVisible();
  await expect(alexPlan.getByRole('link', { name: 'Walk there' })).toHaveAttribute('href', /travelmode=walking/);
  const outsiders = await request.get('/api/quests/mine', { headers: as('jordan') });
  expect((await outsiders.json()).plans.some((plan: { quest: { id: string } }) => plan.quest.id === quest.id)).toBe(false);

  const joined = await request.post(`/api/quests/${quest.id}/join`, { headers: as('maya'), data: {} });
  expect(joined.ok()).toBeTruthy();
  const mayaContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const maya = await mayaContext.newPage();
    await maya.goto('/events?tab=going&as=maya');
    const mayaPlan = maya.getByRole('article', { name: title });
    await expect(mayaPlan).toContainText('Going with Alex');
    await expect(alexPlan).toContainText('Going with Maya');

    await mayaPlan.getByRole('button', { name: 'We’re done' }).click();
    const past = maya.getByRole('region', { name: 'Past plans' }).getByRole('article', { name: title });
    await expect(past.getByLabel('Take a photo together')).toBeVisible();
    const again = await request.post(`/api/quests/${quest.id}/complete`, { headers: as('alex'), data: {} });
    expect(again.ok()).toBeTruthy();
    const { crew } = await again.json();
    await expect(past.getByRole('link', { name: 'Open crew album' })).toHaveAttribute('href', `/memories#crew-${crew.id}`);

    await alexPlan.getByRole('link', { name: 'Open crew album' }).click();
    const album = page.getByRole('region', { name: crew.name });
    await expect(album.getByText('No photos in this album yet.')).toBeVisible();

    await past.getByLabel('Take a photo together').setInputFiles('public/seed/groups/boba-and-sketch.webp');
    await past.getByRole('button', { name: 'Suggest caption' }).click();
    await expect(past.getByLabel('Caption (optional)')).toHaveValue(/Crew photo test/);
    await past.getByRole('button', { name: 'Save to crew album' }).click();
    await expect(past.getByRole('status')).toContainText('Photo saved');
    const photo = album.getByRole('img', { name: /Crew photo test/ });
    await expect(photo).toBeVisible();
    await expect.poll(() => photo.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

    const photoPath = (await photo.getAttribute('src'))!.split('?')[0];
    expect((await request.get(photoPath, { headers: as('jordan') })).status()).toBe(404);
    expect((await request.get(photoPath, { headers: as('alex') })).headers()['content-type']).toBe('image/jpeg');
  } finally {
    await mayaContext.close();
  }
});
