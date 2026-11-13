import { expect, test } from '@playwright/test';
import { seedId } from '../../src/shared/seed/ids';

// Up next: a plan you joined stays on the map with when to leave, "Let's go" and "See plan".
// The 3D walk itself needs a GPU, so this checks the card and its actions on the 2D map.
const STUDY = seedId('quest', 'study'); // starts in 45 min, seats open

test('a plan you joined shows as Up next with Let\'s go and See plan', async ({ page, request }) => {
  const persona = 'jordan';
  const joined = await request.post(`/api/quests/${STUDY}/join`, { headers: { 'x-persona': persona }, data: {} });
  test.skip(!joined.ok(), 'the study sprint is full or not seeded on this server');

  // Up next is the soonest plan you're in that hasn't ended (starting within 2 hours).
  const mine = await (await request.get('/api/quests/mine', { headers: { 'x-persona': persona } })).json() as
    { plans: { quest: { title: string; startsAt: string; endsAt: string; status: string } }[] };
  const now = Date.now();
  const soonest = mine.plans.map((p) => p.quest)
    .filter((q) => q.status !== 'done' && Date.parse(q.endsAt) > now && Date.parse(q.startsAt) - now <= 120 * 60_000)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  expect(soonest).toBeTruthy();

  await page.goto(`/out-here?as=${persona}&view=map&mode=explore`);
  const card = page.getByTestId('up-next');
  await expect(card).toBeVisible({ timeout: 45_000 }); // the first load after a server start compiles the page
  await expect(page.getByTestId('up-next-title')).toContainText(soonest.title);
  await expect(page.getByTestId('up-next-when')).toContainText(/Starts|Happening now/);
  await expect(page.getByTestId('up-next-go')).toHaveText(/Let.s go/);

  await card.getByRole('button', { name: 'See plan' }).click();
  await expect(page.getByTestId('quest-sheet')).toBeVisible();

  await request.post(`/api/quests/${STUDY}/leave`, { headers: { 'x-persona': persona }, data: {} });
});
