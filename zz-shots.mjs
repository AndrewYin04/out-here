import { chromium } from '@playwright/test';
const out = process.argv[2];
const base = 'http://localhost:3177';
const b = await chromium.launch();
for (const w of [1440, 390]) {
  const ctx = await b.newContext({ viewport: { width: w, height: w < 800 ? 844 : 900 }, isMobile: w < 800 });
  const p = await ctx.newPage();
  await p.request.post(base + '/api/intros/reset', { headers: { 'x-persona': 'alex' } });
  await p.request.post(base + '/api/intros/reset', { headers: { 'x-persona': 'jordan' } });
  await p.goto(base + '/?as=alex'); await p.getByTestId('listing-share').first().waitFor();
  await p.getByTestId('listing-share').first().scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${out}/feed-${w}.png` });
  await p.getByTestId('listing-share').first().click(); await p.getByTestId('listing-page').waitFor();
  await p.screenshot({ path: `${out}/listing-${w}.png`, fullPage: true });
  await p.getByTestId('listing-plan').click(); await p.getByTestId('quest-listing').waitFor({ timeout: 20000 });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/sheet-${w}.png` });
  await p.goto(base + '/marketplace?as=alex'); await p.getByTestId('listing-tile').first().waitFor();
  await p.screenshot({ path: `${out}/grid-${w}.png` });
  await p.goto(base + '/intros?as=alex'); await p.getByTestId('run-round').click();
  await p.locator('[data-testid="intro-card"]').first().waitFor({ timeout: 20000 });
  await p.screenshot({ path: `${out}/intro-${w}.png`, fullPage: true });
  await ctx.close();
}
await b.close();
