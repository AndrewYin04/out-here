import { expect, test, devices } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('jordan double-clicks Add friend, priya at 390 watches requests, jordan cancels, priya confirms stale', async ({ browser }) => {
  const jctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });
  const j = await jctx.newPage();
  const p = await pctx.newPage();
  const errs: string[] = [];
  for (const pg of [j, p]) pg.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  await j.request.fetch('/api/friends/priya', { method: 'DELETE', headers: { 'x-persona': 'jordan' } });

  await p.goto('/friends?tab=requests&as=priya');
  await expect(p.getByTestId('friends-requests')).toBeVisible();
  await p.screenshot({ path: '.verify/p-requests-empty.png', fullPage: true });

  await j.goto('/profile/priya?as=jordan');
  const add = j.getByTestId('profile-actions').getByRole('button', { name: 'Add friend' });
  await add.dblclick();
  await expect(j.getByTestId('profile-actions').getByRole('button', { name: 'Cancel request' })).toBeVisible();
  const out = await (await j.request.fetch('/api/friends/requests', { headers: { 'x-persona': 'jordan' } })).json();
  console.log('jordan outgoing to priya:', out.outgoing.filter((r: any) => r.person.handle === 'priya').length);

  // live arrival on priya's 390 screen
  const tile = p.locator('[data-testid="person-tile"][data-handle="jordan"]');
  let liveArrive = true;
  try { await expect(tile).toBeVisible({ timeout: 6000 }); } catch { liveArrive = false; }
  console.log('request arrived live on priya screen:', liveArrive);
  if (!liveArrive) { await p.reload(); await expect(tile).toBeVisible(); }
  await p.screenshot({ path: '.verify/p-requests-390.png', fullPage: true });
  const box = await tile.getByRole('button', { name: 'Confirm' }).boundingBox();
  console.log('confirm box 390:', JSON.stringify(box));
  const docW = await p.evaluate(() => document.documentElement.scrollWidth);
  console.log('priya scrollWidth at 390:', docW);

  // jordan cancels; does priya's tile go away live?
  await j.getByTestId('profile-actions').getByRole('button', { name: 'Cancel request' }).click();
  await expect(j.getByTestId('profile-actions').getByRole('button', { name: 'Add friend' })).toBeVisible();
  await p.waitForTimeout(4000);
  console.log('stale tile still visible on priya after cancel:', await tile.isVisible());
  if (await tile.isVisible()) {
    await tile.getByRole('button', { name: 'Confirm' }).click();
    await p.waitForTimeout(1500);
    console.log('tile text after stale confirm:', (await tile.innerText()).replace(/\n/g, ' | '));
    const toast = await p.locator('[role="status"], [role="alert"]').allInnerTexts();
    console.log('toasts:', JSON.stringify(toast));
    await p.screenshot({ path: '.verify/p-stale-confirm.png', fullPage: true });
  }
  const rel = await (await j.request.fetch('/api/profile/priya', { headers: { 'x-persona': 'jordan' } })).json();
  console.log('final relationship jordan->priya:', rel.relationship);

  // priya views jordan's profile at 390, fast tab switching
  await p.goto('/profile/jordan?as=priya');
  for (const t of ['About', 'Friends', 'Photos', 'Posts', 'Friends', 'About']) {
    await p.getByTestId('profile-header').getByRole('link', { name: t, exact: true }).click();
  }
  await expect(p).toHaveURL(/tab=about/);
  await expect(p.getByTestId('about-card')).toBeVisible();
  console.log('priya page scrollWidth profile 390:', await p.evaluate(() => document.documentElement.scrollWidth));
  await p.screenshot({ path: '.verify/p-profile-390.png', fullPage: true });

  // unknown handle
  await j.goto('/profile/nobody?as=jordan');
  await j.waitForTimeout(2000);
  console.log('unknown handle page text:', (await j.locator('main').innerText()).slice(0, 200).replace(/\n/g, ' | '));
  await j.screenshot({ path: '.verify/j-unknown.png' });

  // message link
  await j.goto('/profile/priya?as=jordan');
  await j.getByTestId('profile-actions').getByRole('link', { name: 'Message' }).click();
  await j.waitForTimeout(2500);
  console.log('message url:', j.url(), 'has textbox:', await j.getByRole('textbox').count(), 'skeleton count:', await j.locator('[aria-busy="true"], .animate-pulse').count());
  await j.screenshot({ path: '.verify/j-message.png' });
  console.log('errors', JSON.stringify(errs));
  await jctx.close(); await pctx.close();
});
