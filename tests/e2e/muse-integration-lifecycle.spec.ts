import {expect,test} from '@playwright/test';

test('a finished 2D agent request releases the next ordinary chat request',async({page})=>{
  await page.goto('/out-here?as=alex&view=map');
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/friends')),page.getByTestId('muse-launcher').click()]);
  await page.getByTestId('muse-input').fill('Is Maya free tonight?');await page.getByTestId('muse-send').click();
  await expect(page.getByTestId('muse-msg-muse').last()).toContainText('still needs to approve',{timeout:30000});
  const next=page.waitForResponse(r=>r.url().endsWith('/api/muse/plan'));
  await page.getByTestId('muse-input').fill('Find art nearby');await page.getByTestId('muse-send').click();expect((await next).ok()).toBeTruthy();
  await expect(page.getByTestId('muse-thinking')).toHaveCount(0);
});

test('photo cancellation, retry and delayed suggestions preserve the saved photo and manual caption',async({page,request},info)=>{
  const headers={'x-persona':'alex'},title=`Photo lifecycle ${info.project.name} ${Date.now()}`;
  const now=Date.now();const{quest}=await(await request.post('/api/quests',{headers,data:{title,category:'art',venueName:'Lifecycle courtyard',location:{lat:37.4847,lng:-122.1477},startsAt:new Date(now-60000).toISOString(),endsAt:new Date(now+600000).toISOString(),capacity:3,isPublic:false}})).json();
  const{crew}=await(await request.post(`/api/quests/${quest.id}/complete`,{headers,data:{}})).json();
  await page.goto('/events?tab=going&as=alex');const plan=page.getByRole('article',{name:title});await expect(plan).toBeVisible();
  await plan.getByRole('button',{name:'Add a photo'}).click();await plan.getByLabel('Take a photo together').setInputFiles('public/seed/groups/boba-and-sketch.webp');await plan.getByLabel('Caption (optional)').fill('Original saved caption');
  const upload=page.waitForResponse(r=>r.url().endsWith('/api/memories')&&r.request().method()==='POST');await plan.getByRole('button',{name:'Save to crew album'}).click();const{memory}=await(await upload).json();
  let release!:()=>void;await page.route('**/api/muse/caption',async r=>{await new Promise<void>(resolve=>{release=resolve;});await r.fulfill({json:{memoryId:memory.id,source:'vision',mode:'live',observation:'Controlled fixture, not real inference.',caption:'Delayed model caption',reaction:null,clarity:'clear'}}).catch(()=>{});});
  await plan.getByRole('button',{name:'Ask Muse for a caption'}).click();await expect(plan.getByRole('button',{name:'Cancel',exact:true})).toBeVisible();await plan.getByRole('button',{name:'Cancel',exact:true}).click();release();await expect(plan.getByLabel('Saved photo caption')).toHaveValue('Original saved caption');await expect(plan.getByRole('alert')).toHaveCount(0);
  await page.unroute('**/api/muse/caption');await page.route('**/api/muse/caption',r=>r.fulfill({status:502,json:{error:'Fixture failure'}}));await plan.getByRole('button',{name:'Ask Muse for a caption'}).click();await expect(plan.getByRole('alert')).toContainText('photo is saved');
  await page.unroute('**/api/muse/caption');await page.route('**/api/muse/caption',async r=>{await new Promise<void>(resolve=>{release=resolve;});await r.fulfill({json:{memoryId:memory.id,source:'vision',mode:'live',observation:'Controlled fixture.',caption:'Delayed model caption',reaction:null,clarity:'clear'}});});
  await plan.getByRole('button',{name:'Ask Muse for a caption'}).click();await expect(plan.getByRole('button',{name:'Cancel',exact:true})).toBeVisible();await plan.getByLabel('Saved photo caption').fill('Manual text while waiting');release();await expect(plan.getByTestId('photo-observation')).toContainText('Controlled fixture.');await expect(plan.getByLabel('Saved photo caption')).toHaveValue('Manual text while waiting');
  const saved=await(await request.get(`/api/memories?crewId=${crew.id}`,{headers})).json();expect(saved.memories.filter((m:{id:string})=>m.id===memory.id)).toHaveLength(1);expect(saved.memories.find((m:{id:string})=>m.id===memory.id).caption).toBe('Original saved caption');
});
