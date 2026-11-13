import{expect,test}from'@playwright/test';
// Controlled map background keeps camera tests independent of the external tile-style DNS.
// The real character, MapLibre camera, renderer, API flows and one shared WebGL canvas still run.
test.beforeEach(async({page})=>{
 await page.route('https://tiles.openfreemap.org/styles/positron',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#F2F4F7'}}]}}));
});


for(const reduced of [false,true])test(`metre-scale world, companion framing and 2D return${reduced?' with reduced motion':''}`,async({page},info)=>{
 if(reduced)await page.emulateMedia({reducedMotion:'reduce'});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/out-here?as=alex&view=3d&worldQA=1');const world=page.getByTestId('world-3d');await expect(world).toHaveAttribute('data-scene-ready','true',{timeout:30000});
 await expect.poll(async()=>Number(await world.getAttribute('data-zoom')),{timeout:30000}).toBeGreaterThan(21.2);
 await expect(page.locator('.maplibregl-canvas')).toHaveCount(1);await expect(world).toHaveAttribute('data-agent-peers','0');await page.screenshot({path:info.outputPath('walking.png')});
 const lat=await world.getAttribute('data-lat'),lng=await world.getAttribute('data-lng');await page.keyboard.down('ArrowUp');await expect.poll(async()=>`${await world.getAttribute('data-lat')}:${await world.getAttribute('data-lng')}`).not.toBe(`${lat}:${lng}`);await page.keyboard.up('ArrowUp');
 await page.getByTestId('muse-launcher').click();await expect(page.getByTestId('muse-chat')).toBeVisible();await expect.poll(async()=>Number(await world.getAttribute('data-zoom')),{timeout:30000}).toBeGreaterThan(23);await page.screenshot({path:info.outputPath('muse-chat.png')});await page.getByTestId('muse-close').click();
 await expect.poll(async()=>Number(await world.getAttribute('data-zoom')),{timeout:15000}).toBeLessThan(22.4);
 await page.getByTestId('view-map').click();await expect(world).toHaveCount(0);await expect(page.locator('.maplibregl-canvas')).toHaveCount(1);
 await page.getByTestId('view-3d').click();await expect(world).toHaveAttribute('data-scene-ready','true');expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(errors).toEqual([]);
});
