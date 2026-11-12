// A visible walkthrough of the 3D view (docs/3D_VIEW_PLAN.md): opens a real browser window and runs each step slowly,
// with a caption banner at the top saying what is being tested and whether it passed.
// Run: start the app (npm run dev), then `npm run watch:3d`. BASE=http://localhost:3100 for another port.
// Needs Playwright's browser once: npx playwright install chromium
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const HQ = { latitude: 37.4847, longitude: -122.1477 };
const results = [];

const browser = await chromium.launch({ headless: false, slowMo: 120, args: ['--window-size=1320,900', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, geolocation: HQ, permissions: ['geolocation'] });
const page = await context.newPage();
await page.bringToFront();

async function caption(text, tone = 'info') {
  await page.evaluate(([t, tone]) => {
    let el = document.getElementById('__pw_caption');
    if (!el) {
      el = document.createElement('div');
      el.id = '__pw_caption';
      el.style.cssText = 'position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:99999;padding:10px 18px;border-radius:12px;font:600 16px/1.3 system-ui;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.35);pointer-events:none;max-width:90vw;text-align:center';
      document.body.append(el);
    }
    el.style.background = tone === 'pass' ? '#1E8E3E' : tone === 'fail' ? '#D93025' : '#1C1E21';
    el.textContent = t;
  }, [text, tone]);
}
async function step(name, fn) {
  await caption(`▶ ${name}`);
  try {
    const note = await fn();
    results.push(`PASS  ${name}${note ? ` — ${note}` : ''}`);
    await caption(`✓ ${name}${note ? ` — ${note}` : ''}`, 'pass');
  } catch (e) {
    results.push(`FAIL  ${name} — ${String(e.message ?? e).split('\n')[0]}`);
    await caption(`✗ ${name}`, 'fail');
  }
  await page.waitForTimeout(1800);
}
const world = page.locator('[data-testid="world-3d"]');
const attr = (a) => world.getAttribute(a);

await page.goto(`${BASE}/out-here?as=alex`);
await page.waitForSelector('[data-testid="out-here-map"]');
await page.waitForTimeout(2500);

await step('Open the 3D view from the Map / 3D button', async () => {
  await page.getByTestId('view-3d').click();
  await world.waitFor();
  await page.waitForTimeout(4500);
  return `zoom ${await attr('data-zoom')}, tilt ${await attr('data-pitch')}°`;
});

await step('Walk with the arrow keys', async () => {
  await page.mouse.click(1000, 600); // focus the page, not a text field
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(1600); await page.keyboard.up('ArrowUp');
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(700); await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(1200); await page.keyboard.up('ArrowUp');
  if (await attr('data-follow') !== 'true') throw new Error('camera stopped following');
});

await step('I’m free → the Muse pet listens, thinks, then answers', async () => {
  await page.getByRole('button', { name: "I'm free", exact: true }).click();
  const bubble = page.getByTestId('pet-bubble');
  await page.waitForTimeout(1200);
  const listen = await bubble.textContent();
  await page.locator('#imfree-text').pressSequentially('hungry, got like 40 min, under $15', { delay: 35 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const think = await bubble.textContent();
  await page.waitForTimeout(4500);
  const answer = await bubble.textContent();
  if (!/fits|plan|Dumpling/i.test(answer ?? '')) throw new Error(`pet said: ${answer}`);
  await page.waitForTimeout(6500); // the pet switches to the top reason
  return `“${listen}” → “${think?.slice(0, 30)}…” → answer`;
});

await step('Select Dumpling Den and tap “Walk there”', async () => {
  await page.getByRole('button', { name: 'Close' }).first().click();
  await page.getByTestId('quest-pin-dumplings').evaluate((el) => el.click());
  const walk = page.getByTestId('walk-there');
  await walk.waitFor({ timeout: 8000 });
  const label = await walk.textContent();
  await walk.click();
  await page.getByTestId('walk-countdown').waitFor({ timeout: 5000 });
  return label?.replace('🚶 ', '');
});

await step('Walk the route until “You’re at Dumpling Den”', async () => {
  await page.getByTestId('arrival').waitFor({ timeout: 90000 });
  return await page.getByTestId('arrival').textContent();
});

await step('Scroll out: the 3D view flattens into the overhead map', async () => {
  const sheetClose = page.getByTestId('quest-sheet').getByRole('button', { name: 'Close' });
  if (await sheetClose.count()) await sheetClose.click();
  await page.mouse.move(1050, 600);
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 260); await page.waitForTimeout(140); }
  await page.waitForTimeout(2800);
  const pitch = Number(await attr('data-pitch'));
  if (pitch > 15) throw new Error(`tilt still ${pitch}°`);
  return `zoom ${await attr('data-zoom')}, tilt ${pitch}°`;
});

await step('Scroll back in: it tilts back down behind the avatar', async () => {
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -260); await page.waitForTimeout(140); }
  await page.waitForTimeout(2800);
  return `zoom ${await attr('data-zoom')}, tilt ${await attr('data-pitch')}°`;
});

await step('Switch to Live GPS (browser location set to Meta HQ)', async () => {
  await page.getByTestId('location-gps').click();
  await page.waitForTimeout(2500);
  if (await attr('data-source') !== 'gps') throw new Error('did not switch to GPS');
  return await page.getByText(/Live GPS ·|Finding you|GPS signal/).first().textContent();
});

await step('Move the fake GPS position north-east: the avatar follows', async () => {
  for (let i = 1; i <= 12; i++) {
    await context.setGeolocation({ latitude: HQ.latitude + i * 0.00004, longitude: HQ.longitude + i * 0.00003, accuracy: 8 });
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(4500);
  const lat = Number(await attr('data-lat'));
  const target = HQ.latitude + 12 * 0.00004;
  if (Math.abs(lat - target) > 0.00006) throw new Error(`avatar at ${lat}, GPS at ${target.toFixed(5)}`);
  return `avatar at ${lat}, ${await attr('data-lng')}`;
});

await step('Back to the Map view', async () => {
  await page.getByTestId('view-map').click();
  await page.waitForTimeout(2500);
  const view = await page.getByTestId('out-here-map').getAttribute('data-view');
  if (view !== 'map') throw new Error(`view is ${view}`);
});

console.log(results.join('\n'));
await caption(`Done: ${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed. Closing in 15 s.`, results.some((r) => r.startsWith('FAIL')) ? 'fail' : 'pass');
await page.waitForTimeout(15000);
await browser.close();
