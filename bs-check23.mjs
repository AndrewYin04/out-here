// Blind-spot checks 2 and 3: Maya's photo in the shared crew album; "Get this group together again".
import { chromium } from '@playwright/test';
import sharp from 'sharp';
const BASE = 'https://out-here-2t69unox2-andrews-projects-76721bc6.vercel.app';
const OUT = 'C:/Users/andre/AppData/Local/Temp/claude/e939015d1f5cfec3/067429bb-77b2-46d4-8f79-5155db8c9819/scratchpad/blindspots';
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const IMG = `${OUT}/fitcheck-test.png`;
await sharp({ create: { width: 600, height: 600, channels: 3, background: { r: 52, g: 92, b: 150 } } })
  .composite([{ input: Buffer.from('<svg width="600" height="600"><rect x="150" y="120" width="300" height="360" rx="30" fill="#1d2f4f"/><rect x="200" y="200" width="200" height="40" fill="#fff"/><text x="300" y="560" font-size="48" text-anchor="middle" fill="#fff">fit check</text></svg>'), top: 0, left: 0 }])
  .png().toFile(IMG);

const browser = await chromium.launch();
async function ctx(width) {
  const c = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 900 }, ...(width < 800 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  return c.newPage();
}
async function goto(page, path) {
  for (let i = 0; i < 4; i++) { try { await page.goto(BASE + path, { timeout: 60000 }); return; } catch (e) { log('retry', path, e.message.split('\n')[0]); await new Promise((r) => setTimeout(r, 3000)); } }
  throw new Error('goto failed ' + path);
}
const watch = (page, name, pat) => {
  const out = [];
  page.on('request', (r) => { if (pat.test(r.url())) r._t = Date.now(); });
  page.on('response', async (r) => {
    if (!pat.test(r.url())) return;
    const sent = r.request()._t; const got = Date.now();
    try { out.push({ who: name, url: r.url().replace(BASE, '').split('?')[0], status: r.status(), ms: sent ? got - sent : null, at: got, body: (await r.text()).slice(0, 1500) }); } catch {}
  });
  return out;
};

const alex = await ctx(1440);
const maya = await ctx(390);
const H = (p) => ({ 'x-persona': p });
async function api(page, persona, method, path, data) {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await page.request.fetch(BASE + path, { method, headers: H(persona), data, timeout: 30000 });
      const j = await r.json().catch(() => ({}));
      log(persona, method, path, r.status());
      return j;
    } catch (e) { log('api retry', path, e.message.split('\n')[0]); }
  }
  throw new Error('api failed ' + path);
}
const now = Date.now();
const { quest } = await api(alex, 'alex', 'POST', '/api/quests', {
  title: 'Boba run', category: 'food', venueName: 'Bobalicious Corner', location: { lat: 37.4842, lng: -122.1456 },
  startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 45 * 60_000).toISOString(), capacity: 3, isPublic: false,
});
log('quest', quest?.id, quest?.title);
await api(maya, 'maya', 'POST', `/api/quests/${quest.id}/join`, {});
const done = await api(alex, 'alex', 'POST', `/api/quests/${quest.id}/complete`, {});
const crewId = done.crew?.id; log('crew', crewId, done.crew?.name);

const mres = watch(maya, 'maya', /\/api\/(memories|muse\/caption|muse\/regroup|crews)/);
const ares = watch(alex, 'alex', /\/api\/(memories|muse\/caption|muse\/regroup|crews)/);
await goto(alex, '/memories?as=alex');
await alex.getByTestId('crew-card').first().waitFor({ timeout: 45000 });
await goto(maya, `/out-here/plan/${quest.id}/memory?as=maya`);
await maya.getByTestId('memory-page').waitFor({ timeout: 45000 });
await maya.waitForTimeout(3000);
await maya.screenshot({ path: `${OUT}/c2-maya-memory-before-390.png` });

// Maya adds the photo.
const tUp = Date.now();
await maya.locator('[data-testid="memory-page"] input[type=file][multiple]').setInputFiles(IMG);
log('maya chose photo');
try { await maya.getByTestId('memory-photos').locator('img').first().waitFor({ timeout: 30000 }); log(`photo on Maya's plan page after ${((Date.now() - tUp) / 1000).toFixed(1)} s`); } catch { log('no photo on Maya page in 30 s'); }
await maya.waitForTimeout(8000);
await maya.screenshot({ path: `${OUT}/c2-maya-memory-after-390.png`, fullPage: true });
log('maya memory page text:', (await maya.getByTestId('memory-page').innerText()).replace(/\s+/g, ' ').slice(0, 900));
const save = maya.getByTestId('memory-save');
if (await save.count() && await save.isEnabled()) { await save.click(); log('maya tapped memory-save'); await maya.waitForTimeout(4000); }

// Alex's album: does the photo show without reload (live), and after reload?
const card = alex.locator(`#crew-${crewId}`);
let live = null;
try { await card.locator('img').first().waitFor({ timeout: 15000 }); live = Date.now(); log(`Alex album photo LIVE after ${((live - tUp) / 1000).toFixed(1)} s`); } catch { log('Alex album: no photo live in 15 s; reloading'); }
if (!live) { await goto(alex, '/memories?as=alex'); try { await card.locator('img').first().waitFor({ timeout: 20000 }); log(`Alex album photo after reload, ${((Date.now() - tUp) / 1000).toFixed(1)} s`); } catch { log('Alex album: still no photo'); } }
await card.scrollIntoViewIfNeeded().catch(() => {});
await alex.waitForTimeout(1500);
await alex.screenshot({ path: `${OUT}/c2-alex-album-1440.png` });
log('alex crew card:', (await card.innerText().catch(() => 'NO CARD')).replace(/\s+/g, ' ').slice(0, 600));

await goto(maya, '/memories?as=maya');
const mcard = maya.locator(`#crew-${crewId}`);
try { await mcard.locator('img').first().waitFor({ timeout: 25000 }); log('Maya album shows photo'); } catch { log('Maya album: no photo'); }
await mcard.scrollIntoViewIfNeeded().catch(() => {});
await maya.waitForTimeout(1500);
await maya.screenshot({ path: `${OUT}/c2-maya-album-390.png` });
log('maya crew card:', (await mcard.innerText().catch(() => 'NO CARD')).replace(/\s+/g, ' ').slice(0, 600));

// Check 3: regroup on Alex's new crew card.
const btn = card.getByRole('button', { name: 'Get this group together again' });
const tR = Date.now();
await btn.click();
try { await card.getByTestId('regroup-suggestion').waitFor({ timeout: 25000 }); log(`regroup suggestion after ${((Date.now() - tR) / 1000).toFixed(1)} s`); } catch { log('no regroup-suggestion in 25 s'); }
await alex.waitForTimeout(500);
await alex.screenshot({ path: `${OUT}/c3-alex-regroup-1440.png` });
log('REGROUP CARD:', (await card.innerText()).replace(/\s+/g, ' ').slice(0, 900));

for (const r of [...mres, ...ares].sort((a, b) => a.at - b.at)) log('resp', r.who, r.url, r.status, 'ms', r.ms, ((r.at - tUp) / 1000).toFixed(1), /caption|regroup/.test(r.url) || r.url === '/api/memories' && r.status >= 400 ? r.body : '');
await browser.close();
