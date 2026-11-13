import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Demo scene 10: the arrival selfie's "Rate the hangout" fires `outhere:rate-hangout`
// ({ questId, crewId, photoIds }). The always-on listener in the shell handles it
// (preventDefault), opens the questionnaire, and the selfie is already in the photo step.
test('outhere:rate-hangout opens the rating with the selfie attached', async ({ page, request }, testInfo) => {
  const project = testInfo.project.name;
  await page.setViewportSize(project === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  const as = (persona: string) => ({ 'x-persona': persona });
  const now = Date.now();
  const title = `Selfie rating ${project} ${now}`;
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
  const done = await request.post(`/api/quests/${quest.id}/complete`, { headers: as('alex'), data: {} });
  expect(done.ok()).toBeTruthy();
  const { crew } = await done.json();
  // The arrival selfie, saved to the crew album the way the selfie dialog saves it.
  const up = await request.post('/api/memories', {
    headers: as('alex'),
    multipart: {
      crewId: crew.id, questId: quest.id,
      photo: { name: 'selfie.webp', mimeType: 'image/webp', buffer: readFileSync('public/seed/groups/boba-and-sketch.webp') },
    },
  });
  expect(up.ok()).toBeTruthy();
  const { memory } = await up.json();

  await page.goto('/?as=alex');
  const dialog = page.getByRole('dialog', { name: 'Rate your hangout' });
  await expect(page.getByRole('main')).toBeVisible();
  await expect(dialog).toHaveCount(0);
  const handled = await page.evaluate((detail) => {
    const e = new CustomEvent('outhere:rate-hangout', { detail, cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  }, { questId: quest.id, crewId: crew.id, photoIds: [memory.id] });
  expect(handled).toBe(true);

  await expect(dialog.getByRole('heading', { name: 'How was it?' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Loved it' }).click();
  for (let asked = 0; await dialog.getByRole('heading', { name: 'Which was better?' }).isVisible(); asked++) {
    expect(asked).toBeLessThan(4);
    await dialog.getByRole('button', { name: /This hangout/ }).click();
  }
  await expect(dialog.getByRole('heading', { name: 'What stood out?' })).toBeVisible();
  const photos = dialog.getByRole('list', { name: 'Photos you added' }).getByRole('img');
  await expect(photos).toHaveCount(1);
  await expect.poll(() => photos.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: `.verify/ratings/${project}-selfie-preset.png` });

  // Saving keeps the selfie on the rating.
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('group', { name: 'Hang out with Maya again?' }).getByRole('button', { name: 'Yes' }).click();
  await dialog.getByRole('button', { name: 'Save rating' }).click();
  await expect(dialog.getByText('Saved. Muse will use this next time.')).toBeVisible();
  const mine = await (await request.get('/api/me/ratings', { headers: as('alex') })).json();
  expect(mine.ratings.find((r: { questId: string }) => r.questId === quest.id).photoIds).toEqual([memory.id]);
});
