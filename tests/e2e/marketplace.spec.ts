import { expect, test } from '@playwright/test';

// The comic open house story, scenes 1-2: Theo's Feed post shares his Marketplace listing, the
// listing page links his Out Here plan, and the plan's sheet links back to the listing.

test('Feed post -> listing page -> Out Here plan -> back to the listing', async ({ page }) => {
  await page.goto('/?as=alex');
  const share = page.getByTestId('listing-share').first();
  await expect(share).toContainText('$60');
  await expect(share).toContainText('View listing');
  await share.click();

  await expect(page).toHaveURL(/\/marketplace\/[0-9a-f-]+/);
  const listing = page.getByTestId('listing-page');
  await expect(listing.getByRole('heading', { level: 1 })).toContainText('Box of indie comics');
  await expect(listing.getByTestId('listing-price')).toHaveText('$60');
  await expect(listing.getByTestId('listing-seller')).toContainText('Theo Nakamura');
  await expect(listing.getByTestId('listing-description')).toContainText('Open house today at Inkwell Comics Café');
  const plan = listing.getByTestId('listing-plan');
  await expect(plan).toContainText('Comics open house');
  await expect(plan).toContainText('Inkwell Comics Café');
  await plan.click();

  await expect(page).toHaveURL(/\/out-here\?quest=/);
  const sheet = page.getByTestId('quest-sheet');
  await expect(sheet).toContainText('Comics open house', { timeout: 20_000 });
  await expect(sheet.getByTestId('quest-host')).toContainText('Hosted by Theo Nakamura');
  await expect(sheet.getByTestId('quest-listing')).toContainText('$60');
  await sheet.getByTestId('quest-listing').click();
  await expect(page).toHaveURL(/\/marketplace\/[0-9a-f-]+/);
});

test('Marketplace grid lists the comics box', async ({ page }) => {
  await page.goto('/marketplace?as=alex');
  const tile = page.getByTestId('listing-tile').filter({ hasText: 'Box of indie comics' });
  await expect(tile).toBeVisible();
  await expect(tile).toContainText('$60');
});
