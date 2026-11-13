import { expect, test } from '@playwright/test';
import { seedId } from '../../src/shared/seed/ids';

// Muse's pick has no matched friend, but friends are free: each one gets a one-tap invite chip.
// The plan, join and invite answers are stubbed (no writes); the quest itself is a real seeded one.
const STUDY = seedId('quest', 'study');

test('free friends get invite chips on Muse’s pick, and one tap invites them', async ({ page, request }) => {
  const friends = (await (await request.get('/api/friends', { headers: { 'x-persona': 'alex' } })).json()) as { friends: { id: string; name: string }[] };
  const maya = friends.friends.find((f) => /^Maya/.test(f.name))!;
  const kai = friends.friends.find((f) => /^Kai/.test(f.name)) ?? friends.friends.find((f) => f.id !== maya.id)!;
  const iso = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

  await page.route('**/api/muse/plan', (r) => r.fulfill({
    json: {
      intent: { activities: ['study'], budgetMax: null, windowStart: iso(0), windowEnd: iso(60), maxWalkMinutes: null, wantsFriends: true, openToNewPeople: true, vibe: null },
      suggestions: [{ kind: 'join_quest', questId: STUDY, friendIds: [], title: 'Silent study sprint', emoji: '📚', reason: 'Fits your hour.', bridge: null,
        startsAt: iso(20), travelMinutes: 8, fitsWindow: true, seatsLeft: 3, inviteDraft: null }],
      summary: 'One plan fits your hour.',
      meta: { mode: 'live', source: 'muse', contextSource: 'store', dropped: [], friendsChecked: 6,
        friendsFree: [
          { id: maya.id, name: maya.name, avatarUrl: '', firstName: 'Maya', freeUntil: iso(90) },
          { id: kai.id, name: kai.name, avatarUrl: '', firstName: kai.name.split(' ')[0], freeUntil: iso(90) },
        ] },
    },
  }));
  let invited: Record<string, unknown> | null = null;
  await page.route(`**/api/quests/${STUDY}/join`, (r) => r.fulfill({ json: { quest: { id: STUDY }, seatsLeft: 2 } }));
  await page.route('**/api/invites', (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    invited = r.request().postDataJSON();
    return r.fulfill({ json: { invite: { id: 'inv-1' } } });
  });

  await page.goto('/out-here?as=alex&view=map');
  await page.getByTestId('im-free').click({ timeout: 45_000 });
  await page.locator('#imfree-text').fill('study, 1 hr');
  await page.getByRole('button', { name: 'Find a plan' }).click();

  const card = page.getByTestId('suggestion').first();
  // the plan carries the free friends' names and photos, so the chips show with it
  await expect(card.getByTestId('also-free')).toBeVisible();
  await expect(card.getByTestId('also-free-invite')).toHaveCount(2);
  await expect(page.getByTestId('precheck-line')).toContainText('free too');
  await expect(page.getByTestId('precheck-line')).not.toContainText('no one free');

  await card.getByRole('button', { name: 'Invite Maya' }).click();
  await expect(card.getByRole('button', { name: 'Maya invited' })).toBeVisible();
  expect(invited).toMatchObject({ toId: maya.id, questId: STUDY });
});
