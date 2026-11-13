import { expect, test } from '@playwright/test';
// Controlled request timing with the local offline planner: no paid inference claim.
test('Claude close-up and portrait retain Codex request ownership and one thought bubble',async({page,request},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/models/**',r=>r.continue());
 const response=await request.post('/api/muse/plan',{headers:{'x-persona':'alex'},data:{text:'food, 45 min'}});expect(response.ok()).toBeTruthy();const result=await response.json();
 await page.goto('/out-here?as=alex&view=3d');
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
