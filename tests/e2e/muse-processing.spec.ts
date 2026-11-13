import { expect, test } from '@playwright/test';
// Controlled map background keeps camera tests independent of the external tile-style DNS.
// The real character, MapLibre camera, renderer, API flows and one shared WebGL canvas still run.
test.beforeEach(async({page})=>{
 await page.route('https://tiles.openfreemap.org/styles/positron',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#F2F4F7'}}]}}));
});

import { seedId } from '../../src/shared/seed/ids';

// Controlled network responses exercise the real chat/controller/render integration without
// spending model credits. They do not claim to test the live Muse service.
test('Muse processing follows requests, renders the existing result, and cancels stale replies', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/out-here?as=alex&view=3d');
  await page.getByTestId('muse-launcher').click();
  expect(await page.getByTestId('muse-thinking').count()).toBe(0);
  let finish!: () => void;
  await page.route('**/api/muse/plan', async route => {
    await new Promise<void>(resolve => { finish = resolve; });
    await route.fulfill({ json: {
      summary: 'Dumplings fit your window.',
      meta: { mode:'live', source:'muse' },
      suggestions: [{ kind:'join_quest',questId:seedId('quest','dumplings'),friendIds:[],title:'Dumplings before the rush',emoji:'🥟',reason:'Nearby and within budget.',bridge:null,startsAt:new Date().toISOString(),travelMinutes:9,fitsWindow:true,seatsLeft:2,inviteDraft:null }],
    }, headers: { 'x-muse-mode':'live', 'x-muse-source':'muse' } });
  });
  await page.getByTestId('muse-input').fill('Dumplings nearby for 30 minutes');
  await page.getByTestId('muse-send').click();
  await expect(page.getByTestId('muse-chat')).toHaveAttribute('data-state','thinking');
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('pending.png') });
  finish();
  await expect(page.getByTestId('muse-chat-plan')).toBeVisible();
  await expect(page.getByTestId('muse-thinking')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('result.png') });
  await page.getByTestId('muse-view-on-map').click();
  await expect(page.getByTestId('muse-chat')).toHaveCount(0);
  await page.getByTestId('muse-launcher').click();
  await page.unroute('**/api/muse/plan');
  await page.route('**/api/muse/plan', r => r.fulfill({ status:502, json:{error:'Muse unavailable'} }));
  await page.getByTestId('muse-input').fill('A different plan');
  await page.getByTestId('muse-send').click();
  await expect(page.getByTestId('muse-error')).toBeVisible();
  await page.unroute('**/api/muse/plan');
  let cancelFinish!: () => void;
  await page.route('**/api/muse/plan', async r => { await new Promise<void>(resolve=>{cancelFinish=resolve;}); await r.abort().catch(()=>{}); });
  await page.getByTestId('muse-input').fill('Cancel this');
  await page.getByTestId('muse-send').click();
  await expect(page.getByTestId('muse-thinking')).toBeVisible();
  await page.getByTestId('muse-close').click();
  cancelFinish();
  await page.getByTestId('muse-launcher').click();
  await expect(page.getByTestId('muse-thinking')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('opening chat frames Muse closely and closing restores the walking zoom', async ({ page }, info) => {
  await page.goto('/out-here?as=alex&view=3d');
  const world=page.getByTestId('world-3d');
  await expect(world).toBeVisible();
  await expect.poll(async()=>Number(await world.getAttribute('data-zoom')), {timeout:30000}).toBeCloseTo(22.1, 1);
  const walkingZoom=Number(await world.getAttribute('data-zoom'));
  await page.getByTestId('muse-launcher').click();
  const phone=(page.viewportSize()?.width ?? 1440)<768;
  await expect.poll(async()=>Number(await world.getAttribute('data-zoom')), {timeout:15000}).toBeGreaterThan(phone ? 20.8 : 21.8);
  await page.waitForTimeout(600);
  await page.screenshot({path:info.outputPath('chat-camera.png')});
  await page.getByTestId('muse-close').click();
  await expect.poll(async()=>Number(await world.getAttribute('data-zoom')), {timeout:15000}).toBeLessThan(walkingZoom+.3);
});
