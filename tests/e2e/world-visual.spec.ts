import{expect,test}from'@playwright/test';

for(const reduced of [false,true])test(`metre-scale world, companion framing and 2D return${reduced?' with reduced motion':''}`,async({page},info)=>{
 if(reduced)await page.emulateMedia({reducedMotion:'reduce'});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/out-here?as=alex&view=3d');const world=page.getByTestId('world-3d');await expect(world).toHaveAttribute('data-scene-ready','true',{timeout:30000});
 await expect.poll(async()=>Number(await world.getAttribute('data-zoom')),{timeout:30000}).toBeGreaterThan(21.2);
 await expect(page.locator('.maplibregl-canvas')).toHaveCount(1);await expect(world).toHaveAttribute('data-agent-peers','0');await page.screenshot({path:info.outputPath('walking.png')});
 const lat=await world.getAttribute('data-lat'),lng=await world.getAttribute('data-lng');await page.keyboard.down('ArrowUp');await expect.poll(async()=>`${await world.getAttribute('data-lat')}:${await world.getAttribute('data-lng')}`).not.toBe(`${lat}:${lng}`);await page.keyboard.up('ArrowUp');
 await page.getByTestId('muse-launcher').click();await expect(page.getByTestId('muse-chat')).toBeVisible();await expect.poll(async()=>Number(await world.getAttribute('data-zoom')),{timeout:30000}).toBeGreaterThan(23);await page.screenshot({path:info.outputPath('muse-chat.png')});await page.getByTestId('muse-close').click();
 await expect.poll(async()=>Number(await world.getAttribute('data-zoom')),{timeout:15000}).toBeLessThan(22.4);
 await page.getByRole('group',{name:'Camera'}).getByRole('button',{name:'Map',exact:true}).click();await expect(world).toHaveCount(0);await expect(page.locator('.maplibregl-canvas')).toHaveCount(1);
 await page.getByRole('group',{name:'Camera'}).getByRole('button',{name:'3D',exact:true}).click();await expect(world).toHaveAttribute('data-scene-ready','true');expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(errors).toEqual([]);
});
