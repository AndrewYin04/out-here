import {expect,test} from '@playwright/test';

// Real current UI and server. Only the model changes between explicit live and offline runs.
// Accepted friends are supported here; this does not impersonate the team's stranger-intro flow.
for(const reduced of [false,true])test(`arrival photo to saved memory and map${reduced?' with reduced motion':''}`,async({page,request},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  if(reduced)await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/out-here?as=alex&view=3d');
  const world=page.getByTestId('world-3d');await expect(world).toHaveAttribute('data-scene-ready','true',{timeout:30000});
  const lat=Number(await world.getAttribute('data-lat')),lng=Number(await world.getAttribute('data-lng'));
  const title=`Comics meetup ${info.project.name} ${Date.now()}`;
  const made=await request.post('/api/quests',{headers:{'x-persona':'alex'},data:{title,category:'art',venueName:'Test comics courtyard',location:{lat:lat+.00055,lng},startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+600000).toISOString(),capacity:3,isPublic:false}});
  expect(made.ok()).toBeTruthy();const{quest}=await made.json();
  expect((await request.post(`/api/quests/${quest.id}/join`,{headers:{'x-persona':'maya'},data:{}})).ok()).toBeTruthy();
  await page.goto(`/out-here?as=alex&view=3d&quest=${quest.id}`);
  // Phones: the open plan card covers the 3D Walk there button; its Let's go starts the same walk.
  const go=page.getByTestId(info.project.name==='phone'?'quest-lets-go':'walk-there');await expect(go).toBeVisible({timeout:30000});await go.click();
  const dialog=page.getByRole('dialog',{name:'You made it'});await expect(dialog).toBeVisible({timeout:30000});
  await dialog.getByLabel('Take a photo together').setInputFiles('public/seed/groups/boba-and-sketch.webp');
  await dialog.getByLabel('Caption (optional)').fill('Our comics meetup');
  const upload=page.waitForResponse(r=>r.url().endsWith('/api/memories')&&r.request().method()==='POST');
  await dialog.getByRole('button',{name:'Save to crew album'}).click();const saved=await(await upload).json();
  await expect(dialog.getByTestId('saved-photo-review')).toBeVisible();
  await expect.poll(()=>dialog.getByTestId('saved-photo-review').locator('img').evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const result=page.waitForResponse(r=>r.url().endsWith('/api/muse/caption'));
  await dialog.getByRole('button',{name:'Ask Muse for a caption'}).click();
  await page.screenshot({path:info.outputPath(reduced?'photo-reduced.png':'photo-pending.png')});
  if(reduced)expect(await page.locator('[data-muse-photo-scan]').count()).toBe(0);
  else if(await page.locator('[data-muse-photo-scan]').count())expect(await page.locator('[data-muse-photo-scan]').evaluate(el=>Number(getComputedStyle(el).zIndex))).toBeGreaterThan(60);
  const response=await result;expect(response.ok()).toBeTruthy();const analyzed=await response.json();expect(analyzed.mode).toBe(process.env.E2E_MUSE_LIVE==='1'?'live':'mock');expect(analyzed.memoryId).toBe(saved.memory.id);
  await expect(dialog.getByTestId('photo-observation')).toBeVisible();
  await dialog.getByLabel('Saved photo caption').fill('Comics and friends, caption edited by me');const edit=page.waitForResponse(r=>r.url().includes(`/api/memories/${saved.memory.id}`)&&r.request().method()==='PATCH');await dialog.getByRole('button',{name:'Save caption',exact:true}).click();expect((await edit).ok()).toBeTruthy();await expect(dialog.getByRole('button',{name:/Saving caption|^Save caption$/})).toHaveCount(0);
  await page.screenshot({path:info.outputPath('saved-photo.png')});
  await dialog.getByRole('link',{name:'View memory'}).click();await expect(page.getByRole('img',{name:'Comics and friends, caption edited by me',exact:true})).toBeVisible({timeout:20000});
  await page.screenshot({path:info.outputPath('memory.png')});
  const rows=await(await request.get(`/api/memories?crewId=${saved.memory.crewId}`,{headers:{'x-persona':'alex'}})).json();expect(rows.memories.filter((m:{id:string})=>m.id===saved.memory.id)).toHaveLength(1);
  await page.goto('/out-here?as=alex&view=3d');await expect(page.getByTestId('world-3d')).toBeVisible();expect(errors).toEqual([]);
});
