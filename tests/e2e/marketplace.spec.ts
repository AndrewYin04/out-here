import { expect, test } from '@playwright/test';

// The closet sale story, scenes 1-2: Leah's Feed post shares her Marketplace listing, the
// listing page links her Out Here plan (by its general area), and the plan's sheet links back.

test('Feed post -> listing page -> Out Here plan -> back to the listing', async ({ page }) => {
  await page.goto('/?as=alex');
  const share = page.getByTestId('post-card').filter({ hasText: 'Closet sale today' }).getByTestId('listing-share');
  await expect(share).toContainText('$5');
  await expect(share).toContainText('View listing');
  await share.click();

  await expect(page).toHaveURL(/\/marketplace\/[0-9a-f-]+/);
  const listing = page.getByTestId('listing-page');
  await expect(listing.getByRole('heading', { level: 1 })).toContainText('Closet clean-out');
  await expect(listing.getByTestId('listing-price')).toHaveText('$5');
  await expect(listing.getByTestId('listing-seller')).toContainText('Leah Moreno');
  await expect(listing.getByTestId('listing-description')).toContainText('Closet sale today in Belle Haven');
  const plan = listing.getByTestId('listing-plan');
  await expect(plan).toContainText('Closet sale + try-ons');
  await expect(plan).toContainText('Belle Haven, near Ivy Dr');
  await expect(plan).not.toContainText('Willow Court Apartments');
  await plan.click();

  await expect(page).toHaveURL(/\/out-here\?quest=/);
  const sheet = page.getByTestId('quest-sheet');
  await expect(sheet).toContainText('Closet sale + try-ons', { timeout: 20_000 });
  await expect(sheet.getByTestId('quest-host')).toContainText('Hosted by Leah Moreno');
  await expect(sheet.getByTestId('quest-listing')).toContainText('$5');
  await sheet.getByTestId('quest-listing').click();
  await expect(page).toHaveURL(/\/marketplace\/[0-9a-f-]+/);
});

test('Marketplace grid lists the closet clean-out', async ({ page }) => {
  await page.goto('/marketplace?as=alex');
  const tile = page.getByTestId('listing-tile').filter({ hasText: 'Closet clean-out' });
  await expect(tile).toBeVisible();
  await expect(tile).toContainText('$5');
});
