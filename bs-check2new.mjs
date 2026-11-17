// Check 2 on the new URL with #95's arrival moment, then check 3 (regroup) on the new crew.
import { chromium } from '@playwright/test';
const BASE = 'https://out-here-kze7ta3bd-andrews-projects-76721bc6.vercel.app';
const OUT = 'C:/Users/andre/AppData/Local/Temp/claude/e939015d1f5cfec3/067429bb-77b2-46d4-8f79-5155db8c9819/scratchpad/blindspots';
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
async function ctx(width) {
  const c = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 900 }, ...(width < 800 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  await c.grantPermissions(['camera', 'microphone'], { origin: BASE });
  return c.newPage();
}
async function goto(page, path) {
  for (let i = 0; i < 4; i++) { try { await page.goto(BASE + path, { timeout: 60000 }); return; } catch (e) { log('retry', path, e.message.split('\n')[0]); await new Promise((r) => setTimeout(r, 3000)); } }
  throw new Error('goto failed ' + path);
}
const resps = [];
const watch = (page, who) => {
  page.on('request', (r) => { if (/\/api\/(memories|muse\/caption|muse\/regroup|crews|together)/.test(r.url())) r._t = Date.now(); });
  page.on('response', async (r) => {
    const sent = r.request()._t; if (!sent) return;
    const got = Date.now();
    try { resps.push({ who, m: r.request().method(), url: r.url().replace(BASE, '').split('?')[0], status: r.status(), ms: got - sent, at: got, body: (await r.text()).slice(0, 700) }); } catch {}
  });
};
async function api(page, persona, method, path, data) {
  for (let i = 0; i < 3; i++) {
    try { const r = await page.request.fetch(BASE + path, { method, headers: { 'x-persona': persona }, data, timeout: 30000 }); log(persona, method, path, r.status()); return await r.json().catch(() => ({})); }
    catch (e) { log('api retry', path, e.message.split('\n')[0]); await new Promise((r) => setTimeout(r, 3000)); }
  }
  throw new Error('api failed');
}
const alex = await ctx(1440); const maya = await ctx(390);
watch(alex, 'alex'); watch(maya, 'maya');
const { users } = await api(alex, 'alex', 'GET', '/api/users');
const mayaId = users.find((u) => u.handle === 'maya').id;
const now = Date.now();
const { quest } = await api(alex, 'alex', 'POST', '/api/quests', {
  title: 'Boba run', category: 'food', venueName: 'Bobalicious Corner', location: { lat: 37.4842, lng: -122.1456 },
  startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 45 * 60_000).toISOString(), capacity: 4, visibility: 'friends', emoji: '🧋', priceMax: 7, tags: [], description: 'Boba before the rush', inviteIds: [mayaId], inviteMessage: 'boba at Bobalicious Corner?',
});
const inv = await api(maya, 'maya', 'GET', '/api/invites');
const mine = (inv.incoming ?? []).find((i) => (i.invite?.questId ?? i.questId) === quest.id);
log('invite', JSON.stringify(mine).slice(0, 200));
await api(maya, 'maya', 'POST', `/api/invites/${mine.invite?.id ?? mine.id}/respond`, { status: 'accepted' });
log('quest', quest.id);

await goto(alex, '/memories?as=alex');
await alex.getByRole('heading', { name: 'Memories', level: 1 }).waitFor({ timeout: 45000 });
await goto(maya, '/out-here?as=maya&view=3d');
await maya.getByTestId('out-here-map').waitFor({ timeout: 60000 });
await maya.waitForTimeout(4000);
await maya.locator('[data-testid="out-here-map"][data-view="3d"]').waitFor({ timeout: 30000 }).then(() => log('maya in 3D')).catch(() => log('maya NOT in 3D'));
await maya.waitForTimeout(6000);
// Same event as "Take a photo together" on Up next (requestSelfie in memories/arrival.ts).
const handled = await maya.evaluate((id) => !window.dispatchEvent(new CustomEvent('outhere:open-selfie', { detail: id, cancelable: true })), quest.id);
log('open-selfie handled by World3D:', handled);
const stage = maya.getByTestId('together-moment');
await stage.waitFor({ timeout: 20000 });
await maya.waitForTimeout(1500);
await maya.screenshot({ path: `${OUT}/c2new-maya-arrival-390.png` });
log('arrival:', (await stage.innerText()).replace(/\s+/g, ' ').slice(0, 400));
await maya.getByTestId('arrival-shutter').click();
await maya.getByTestId('arrival-camera').waitFor({ timeout: 15000 });
await maya.waitForTimeout(2500);
await maya.screenshot({ path: `${OUT}/c2new-maya-camera-390.png` });
const tShot = Date.now();
await maya.getByTestId('together-shutter').click();
log('maya took the photo');
const saved = maya.getByTestId('arrival-saved');
await saved.waitFor({ timeout: 30000 });
log(`arrival-saved after ${((Date.now() - tShot) / 1000).toFixed(1)} s`);
try { await maya.getByTestId('arrival-done').and(maya.locator(':enabled')).waitFor({ timeout: 30000 }); log(`saved (Done enabled) after ${((Date.now() - tShot) / 1000).toFixed(1)} s`); } catch { log('Done never enabled'); }
await maya.waitForTimeout(1500);
log('caption:', JSON.stringify(await maya.getByTestId('arrival-caption').innerText().catch(() => 'NONE')));
await maya.screenshot({ path: `${OUT}/c2new-maya-saved-390.png` });

// Alex's Memories: live, then reload.
let crewId = null;
for (let i = 0; i < 2 && !crewId; i++) {
  const { crews } = await api(alex, 'alex', 'GET', '/api/crews');
  crewId = crews?.find((c) => c.originQuestId === quest.id)?.id ?? null;
  if (!crewId) await alex.waitForTimeout(3000);
}
log('crewId', crewId);
const card = alex.locator(`#crew-${crewId}`);
const photoIn = (c) => c.locator('img[src*="/api/memories/"], img[src*="memories"]').first();
let ok = false;
try { await photoIn(card).waitFor({ timeout: 12000 }); ok = true; log(`Alex album photo LIVE, ${((Date.now() - tShot) / 1000).toFixed(1)} s after shutter`); } catch { log('Alex: not live in 12 s, reloading'); }
if (!ok) { await goto(alex, '/memories?as=alex'); try { await photoIn(card).waitFor({ timeout: 25000 }); log(`Alex album photo after reload, ${((Date.now() - tShot) / 1000).toFixed(1)} s`); } catch { log('Alex: NO photo after reload'); } }
await card.scrollIntoViewIfNeeded().catch(() => {}); await alex.waitForTimeout(1500);
await alex.screenshot({ path: `${OUT}/c2new-alex-album-1440.png` });
log('alex card:', (await card.innerText().catch(() => 'NO CARD')).replace(/\s+/g, ' ').slice(0, 500));

await maya.getByTestId('arrival-done').click().catch(() => {});
await goto(maya, '/memories?as=maya');
const mcard = maya.locator(`#crew-${crewId}`);
try { await photoIn(mcard).waitFor({ timeout: 25000 }); log('Maya album shows photo'); } catch { log('Maya album: NO photo'); }
await mcard.scrollIntoViewIfNeeded().catch(() => {}); await maya.waitForTimeout(1500);
await maya.screenshot({ path: `${OUT}/c2new-maya-album-390.png` });
log('maya card:', (await mcard.innerText().catch(() => 'NO CARD')).replace(/\s+/g, ' ').slice(0, 500));

// Check 3 on the new URL.
const tR = Date.now();
await card.getByRole('button', { name: 'Get this group together again' }).click();
try { await card.getByTestId('regroup-suggestion').waitFor({ timeout: 25000 }); log(`regroup after ${((Date.now() - tR) / 1000).toFixed(1)} s`); } catch { log('no regroup suggestion in 25 s'); }
await alex.waitForTimeout(500);
await alex.screenshot({ path: `${OUT}/c3new-alex-regroup-1440.png` });
log('REGROUP:', (await card.innerText()).replace(/\s+/g, ' ').slice(0, 900));
for (const r of resps.sort((a, b) => a.at - b.at)) if (r.m !== 'GET' || /caption|regroup/.test(r.url)) log('resp', r.who, r.m, r.url, r.status, `${r.ms} ms`, ((r.at - tShot) / 1000).toFixed(1), r.body.slice(0, 400));
await browser.close();
