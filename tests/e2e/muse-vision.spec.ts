import {expect,test} from '@playwright/test';
import {readFile} from 'node:fs/promises';

// Backend contract + existing album, intentionally no shared photo UI rewrite.
// Default run uses the isolated mock server. A separate real image call is recorded
// in the Phase 6 handoff; mock observations never masquerade as image understanding.
test('saved-photo analysis preserves the photo; only an explicit caption edit changes the same record',async({page,request},info)=>{
  const headers={'x-persona':'alex'};
  const crews=await(await request.get('/api/crews',{headers})).json(),crew=crews.crews[0];
  const saved=await request.post('/api/memories',{headers,multipart:{
    crewId:crew.id,questId:crew.originQuestId,caption:`Photo before analysis ${info.project.name}`,
    photo:{name:'scene.webp',mimeType:'image/webp',buffer:await readFile('public/seed/groups/boba-and-sketch.webp')},
  }});
  expect(saved.status()).toBe(200);const{memory}=await saved.json();
  const response=await request.post('/api/muse/caption',{headers,data:{memoryId:memory.id,consent:true}});
  expect(response.status()).toBe(200);const result=await response.json();expect(result).toMatchObject({memoryId:memory.id,mode:'mock',source:'vision',caption:null});
  expect(result.observation).toContain('not been analyzed');
  const unchanged=await(await request.get(`/api/memories?crewId=${crew.id}`,{headers})).json();
  expect(unchanged.memories.find((m:{id:string})=>m.id===memory.id).caption).toBe(memory.caption);
  expect((await request.post('/api/muse/caption',{headers:{'x-persona':'maya'},data:{memoryId:memory.id,consent:true}})).status()).toBe(404);
  expect((await request.post('/api/muse/caption',{headers,data:{memoryId:memory.id}})).status()).toBe(400);
  const updated=await request.patch(`/api/memories/${memory.id}`,{headers,data:{caption:`My edited photo ${info.project.name}`}});
  expect(updated.status()).toBe(200);expect((await updated.json()).memory.photoUrl).toBe(memory.photoUrl);
  expect((await request.patch(`/api/memories/${memory.id}`,{headers:{'x-persona':'maya'},data:{caption:'Unwanted'}})).status()).toBe(404);
  const rows=await(await request.get(`/api/memories?crewId=${crew.id}`,{headers})).json();expect(rows.memories.filter((m:{id:string})=>m.id===memory.id)).toHaveLength(1);
  await page.goto(`/memories?as=alex#crew-${crew.id}`);
  await expect(page.getByRole('img',{name:`My edited photo ${info.project.name}`,exact:true})).toBeVisible({timeout:20000});
  await page.screenshot({path:info.outputPath('existing-album.png')});
  expect((await request.get(memory.photoUrl,{headers:{'x-persona':'jordan'}})).status()).toBe(404);
});
