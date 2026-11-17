// Blind-spot check 1: Leo opens the pop-up; Maya (390) gets a Muse find for the denim bag.
import { chromium } from '@playwright/test';
const BASE = 'https://out-here-kze7ta3bd-andrews-projects-76721bc6.vercel.app';
const OUT = 'C:/Users/andre/AppData/Local/Temp/claude/e939015d1f5cfec3/067429bb-77b2-46d4-8f79-5155db8c9819/scratchpad/blindspots';
const RUN = process.argv[2] || 'r1';
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

async function open(browser, handle, width, q) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 800 ? 844 : 900 },
    ...(width < 800 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
  });
  const page = await ctx.newPage();
  for (let i = 0; i < 2; i++) {
    try {
      await page.goto(`${BASE}/out-here?as=${handle}${q}`, { timeout: 60000 });
      await page.getByTestId('out-here-map').waitFor({ timeout: 60000 });
      return page;
    } catch (e) { log(handle, 'load retry', e.message.split('\n')[0]); }
  }
  throw new Error('load failed ' + handle);
}

const browser = await chromium.launch();
const maya = await open(browser, 'maya', 390, '');
const finds = [];
maya.on('response', async (r) => {
  if ((r.url().includes('/api/muse/finds') || r.url().includes('/api/muse/marketplace-picks') || r.url().includes('/api/listings/map'))) {
    try { const tt = Date.now(); finds.push({ t: tt, url: r.url().split('?')[0].replace(BASE,''), status: r.status(), ms: Math.round(r.request().timing().responseEnd), body: await r.text() }); } catch {}
  }
});
const leo = await open(browser, 'leo', 1440, '&sell=popup');
const sheet = leo.getByTestId('popup-sheet');
await sheet.waitFor({ timeout: 30000 });
log('leo sheet:', (await sheet.innerText()).replace(/\s+/g, ' ').slice(0, 300));
await maya.waitForTimeout(3000);
await maya.screenshot({ path: `${OUT}/c1-${RUN}-maya-before-390.png` });
const tap = Date.now();
await leo.getByTestId('popup-open').click();
log('leo tapped Open the pop-up');
let card = null;
try {
  await maya.getByTestId('muse-find').first().waitFor({ timeout: 60000 });
  card = Date.now();
} catch { log('no muse-find within 60 s'); }
if (card) {
  log(`Maya card after ${((card - tap) / 1000).toFixed(1)} s`);
  await maya.waitForTimeout(800);
  log('CARD TEXT:', JSON.stringify(await maya.getByTestId('muse-find').first().innerText()));
}
await maya.screenshot({ path: `${OUT}/c1-${RUN}-maya-find-390.png` });
await leo.screenshot({ path: `${OUT}/c1-${RUN}-leo-1440.png` });
for (const f of finds) log('resp', f.url, ((f.t - tap) / 1000).toFixed(1), f.status, 'ms', f.ms, f.url.includes('listings') ? f.body.length : f.body.slice(0, 900));
await maya.waitForTimeout(1500); for (const f of finds.slice(-0)) {} await browser.close();
