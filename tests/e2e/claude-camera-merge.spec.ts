import { expect, test } from '@playwright/test';
// Controlled map background keeps camera tests independent of the external tile-style DNS.
// The real character, MapLibre camera, renderer, API flows and one shared WebGL canvas still run.
test.beforeEach(async({page})=>{
 await page.route('https://tiles.openfreemap.org/styles/positron',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#F2F4F7'}}]}}));
});

// Controlled request timing with the local offline planner: no paid inference claim.
test('Claude close-up and portrait retain Codex request ownership and one thought bubble',async({page,request},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/models/**',r=>r.continue());
 const response=await request.post('/api/muse/plan',{headers:{'x-persona':'alex'},data:{text:'food, 45 min'}});expect(response.ok()).toBeTruthy();const result=await response.json();
 await page.goto('/out-here?as=alex&view=3d&worldQA=1');
 await expect(page.locator('[data-world-models=ready]')).toBeVisible({timeout:45000});
 await page.getByTestId('muse-launcher').click();
 const chat=page.getByTestId('muse-chat'),move=chat.getByRole('button',{name:'Make Jolly do a move'});
 await expect(chat.locator('header img')).toHaveAttribute('src','/muse/jolly-pfp.webp');
 await expect(move).toBeEnabled();
 await expect(page.getByTestId('world-3d')).toHaveAttribute('data-muse-chat','true');
 await expect.poll(()=>page.locator('.maplibregl-marker').evaluateAll(nodes=>nodes.every(n=>(n as HTMLElement).inert))).toBe(true);
 let release!:()=>void;
 await page.route('**/api/muse/plan',async r=>{await new Promise<void>(resolve=>{release=resolve;});await r.fulfill({json:result,headers:{'x-muse-mode':'mock','x-muse-source':'muse'}}).catch(()=>{});});
 await page.getByTestId('muse-input').fill('food, 45 min');await page.getByTestId('muse-send').click();
 await expect(move).toBeDisabled();await expect(page.locator('.muse-thought')).toHaveCount(1);
 await expect(page.locator('.muse-thought')).toHaveText('Working on your request');
 await page.waitForTimeout(2500);await expect(page.locator('.muse-thought')).toHaveCount(1);
 await page.screenshot({path:info.outputPath('combined-pending.png')});
 release();await expect(page.getByTestId('muse-thinking')).toHaveCount(0);await expect(page.locator('.muse-thought')).toHaveCount(1);
 await page.getByTestId('muse-close').click();await expect(page.locator('.muse-thought')).toHaveCount(0);
 await expect.poll(()=>page.locator('.maplibregl-marker').evaluateAll(nodes=>nodes.every(n=>!(n as HTMLElement).inert))).toBe(true);
 await expect(page.locator('.maplibregl-canvas')).toHaveCount(1);expect(errors).toEqual([]);
});

test('conversation framing stays fixed through typing, a gesture, pending and result',async({page},info)=>{
 await page.route('**/models/**',r=>r.continue());
 await page.goto('/out-here?as=alex&view=3d&worldQA=1');
 await expect(page.locator('[data-world-models=ready]')).toBeVisible({timeout:45000});
 const world=page.getByTestId('world-3d');
 await expect.poll(async()=>Number(await world.getAttribute('data-zoom')),{timeout:30000}).toBeCloseTo(22.1,1);
 await page.getByTestId('muse-launcher').click();
 const phone=(page.viewportSize()?.width??1440)<768;
 await expect.poll(async()=>Number(await world.getAttribute('data-zoom')),{timeout:20000}).toBeCloseTo(phone?23.5:23.3,1);
 await expect.poll(async()=>Number(await world.getAttribute('data-pitch'))).toBe(60);
 const zoom=await world.getAttribute('data-zoom');
 await page.getByTestId('muse-input').fill('Find a short walk and somewhere to eat');
 await page.getByRole('button',{name:'Make Jolly do a move'}).click();
 let finish!:()=>void;
 await page.route('**/api/muse/plan',async route=>{await new Promise<void>(r=>{finish=r;});await route.fulfill({json:{summary:'A nearby walk fits.',suggestions:[],meta:{mode:'mock',source:'muse'}},headers:{'x-muse-mode':'mock'}}).catch(()=>{});});
 await page.getByTestId('muse-send').click();
 await expect(page.getByTestId('muse-thinking')).toBeVisible();await page.waitForTimeout(1600);
 await expect(world).toHaveAttribute('data-zoom',zoom!);await expect(world).toHaveAttribute('data-pitch','60');
 finish();await expect(page.getByTestId('muse-thinking')).toHaveCount(0);await page.waitForTimeout(1600);
 await expect(world).toHaveAttribute('data-zoom',zoom!);await expect(world).toHaveAttribute('data-pitch','60');
 await page.screenshot({path:info.outputPath('stable-result.png')});
 await page.getByTestId('muse-close').click();
 await expect.poll(async()=>Number(await world.getAttribute('data-zoom')),{timeout:15000}).toBeCloseTo(22.1,1);
 await expect.poll(async()=>Number(await world.getAttribute('data-pitch'))).toBe(82);
});
