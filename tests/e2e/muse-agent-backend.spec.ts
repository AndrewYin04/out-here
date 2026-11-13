import { expect, test } from '@playwright/test';

// Real backend route in both modes. Run E2E_MUSE_LIVE=1 only against an explicitly
// configured local Muse server; the test never reads or prints a credential.
test('ordinary chat coordinates through the server ledger and returns to the owner', async ({ page, request }, info) => {
  const errors: string[] = [];
  let inviteWrites = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', req => { if (req.method() === 'POST' && req.url().endsWith('/api/invites')) inviteWrites++; });
  await page.goto('/out-here?as=alex&view=3d');
  await expect(page.getByTestId('world-3d')).toBeVisible({ timeout:20000 });
  await expect(page.getByTestId('world-3d')).toHaveAttribute('data-scene-ready', 'true', { timeout:20000 });
  await Promise.all([page.waitForResponse(r => r.url().endsWith('/api/friends')), page.getByTestId('muse-launcher').click()]);
  const pending = page.waitForResponse(r => r.url().endsWith('/api/muse/encounters') && r.request().method() === 'POST');
  await page.getByTestId('muse-input').fill('Is Maya free to get food tonight?');
  await page.getByTestId('muse-send').click();
  const peerCount = async () => Number(await page.getByTestId('world-3d').getAttribute('data-agent-peers').catch(() => 0));
  await expect.poll(peerCount, { timeout: 15000 }).toBe(1);
  await page.waitForTimeout(1700);
  await page.screenshot({ path: info.outputPath('meeting.png') });
  const response = await pending;
  expect(response.status()).toBe(200);
  const transcript = await response.text();
  const mode = process.env.E2E_MUSE_LIVE === '1' ? 'live' : 'mock';
  expect(transcript).toContain(`"mode":"${mode}"`);
  const eventTypes = [...transcript.matchAll(/"type":"(accepted|sent|received)"/g)].map(m => m[1]);
  expect(eventTypes).toEqual(['accepted', 'sent', 'received']);
  const id = JSON.parse(transcript.split('data: ')[1].split('\n')[0]).id as string;
  await expect(page.getByTestId('muse-msg-muse').last()).toContainText('still needs to approve', { timeout: 28000 });
  await expect(page.getByTestId('muse-chat-plan').last()).toBeVisible();
  await expect(page.getByTestId('muse-chat-plan').last()).not.toContainText('can make it');
  await expect.poll(peerCount, { timeout: 15000 }).toBe(0);
  expect(inviteWrites).toBe(0);
  const own = await request.get(`/api/muse/encounters/${id}`, { headers: { 'x-persona': 'alex' } });
  expect((await own.json()).status).toBe('completed');
  const other = await request.get(`/api/muse/encounters/${id}`, { headers: { 'x-persona': 'maya' } });
  expect(other.status()).toBe(404);
  await page.screenshot({ path: info.outputPath('result.png') });
  const invite = page.getByRole('button', { name:'Invite Maya', exact:true });
  if (await invite.count()) {
    await invite.click();
    await expect(page.getByTestId('invite-draft')).toBeVisible();
    expect(inviteWrites).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('stream failure uses existing error UI and releases the peer', async ({ page }) => {
  await page.goto('/out-here?as=alex&view=3d');
  await Promise.all([page.waitForResponse(r => r.url().endsWith('/api/friends')), page.getByTestId('muse-launcher').click()]);
  let attempts=0;
  await page.route('**/api/muse/encounters', r => { attempts++; return r.fulfill({ status:502, json: { error:'Unavailable' } }); });
  await page.getByTestId('muse-input').fill('Is Maya free tonight?'); await page.getByTestId('muse-send').click();
  await expect(page.getByTestId('muse-error')).toBeVisible();
  await expect(page.getByTestId('muse-thinking')).toHaveCount(0);
  await page.getByRole('button', { name:'Retry', exact:true }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(page.getByTestId('muse-error')).toBeVisible();
});
