// Beat 1 on the new URL: Alex 1440x900, I'm free, draft card; is "Make this plan" above the fold?
import { chromium } from '@playwright/test';
const BASE = 'https://out-here-kze7ta3bd-andrews-projects-76721bc6.vercel.app';
const OUT = 'C:/Users/andre/AppData/Local/Temp/claude/e939015d1f5cfec3/067429bb-77b2-46d4-8f79-5155db8c9819/scratchpad/blindspots';
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
for (let i = 0; i < 4; i++) { try { await page.goto(`${BASE}/out-here?as=alex`, { timeout: 60000 }); break; } catch (e) { log('retry', e.message.split('\n')[0]); await page.waitForTimeout(3000); } }
await page.getByTestId('im-free').click({ timeout: 60000 });
await page.locator('#imfree-text').fill("I've got 45 minutes. Can I grab boba with someone nearby?");
const tS = Date.now();
await page.locator('#imfree-text').press('Enter');
await page.getByTestId('draft-hang-make').waitFor({ timeout: 60000 });
log(`draft card after ${((Date.now() - tS) / 1000).toFixed(1)} s`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/beat1-draft-1440x900.png` });
const box = await page.getByTestId('draft-hang-make').boundingBox();
const inView = await page.getByTestId('draft-hang-make').evaluate((el) => {
  const r = el.getBoundingClientRect();
  // also check it is not inside a scrolled-off region of a scroll container
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { top: r.top, bottom: r.bottom, vh: innerHeight, onTop: !!hit && (hit === el || el.contains(hit)) };
});
log('Make this plan box', JSON.stringify(box), JSON.stringify(inView));
log('card text:', (await page.getByTestId('draft-hang').innerText()).replace(/\s+/g, ' ').slice(0, 800));
await browser.close();
