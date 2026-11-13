import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import sharp from 'sharp';
import {createMemoryStore} from '@/features/data/server';
import {onRun,setMuseTransport,type MuseTransport,type MuseRunRecord} from '@/features/muse';
import {profileId,type Memory} from '@/shared';
import {analyzeSavedPhoto} from './analysis';
const owner=profileId('alex');
const observation={observation:'Colorful books sit on a shelf.',caption:'A shelf full of new stories.',reaction:'So many covers to browse.',clarity:'clear'};
let store:ReturnType<typeof createMemoryStore>,memory:Memory,calls:Parameters<MuseTransport>[0][],runs:MuseRunRecord[];
beforeEach(async()=>{
  vi.stubEnv('MUSE_MOCK','0');vi.stubEnv('MUSE_API_KEY','test-placeholder');
  store=createMemoryStore();calls=[];runs=[];onRun(r=>{runs.push(r);});
  const crew=(await store.crews(owner))[0];
  const bytes=await sharp(Buffer.from('<svg width="120" height="80"><rect width="120" height="80" fill="#eee"/><rect x="20" y="10" width="20" height="60" fill="red"/><rect x="45" y="10" width="20" height="60" fill="blue"/></svg>')).jpeg().toBuffer();
  memory=await store.addMemory(owner,{crewId:crew.id,questId:crew.originQuestId,caption:'My original caption',file:{bytes,contentType:'image/jpeg'}});
  setMuseTransport(async r=>{calls.push(r);return{content:JSON.stringify(observation),usage:{promptTokens:10,completionTokens:10}};});
});
afterEach(()=>{setMuseTransport(null);onRun(()=>{});vi.unstubAllEnvs();vi.useRealTimers();});
const analyze=(id=memory.id,who=owner,signal=new AbortController().signal)=>analyzeSavedPhoto(store,who,id,signal);
it('sends authorized image bytes to the vision model, not an external URL or unrelated people',async()=>{
  const result=await analyze();expect(result).toMatchObject({...observation,memoryId:memory.id,mode:'live',source:'vision'});
  expect(calls).toHaveLength(1);expect(calls[0].model).toBe('muse-spark-1.3');
  const content=calls[0].messages[1].content;
  if(typeof content==='string')throw Error('Missing image');
  const image=content.find(p=>p.type==='image_url');expect(image?.type).toBe('image_url');
  if(image?.type==='image_url')expect(image.image_url.url).toMatch(/^data:image\/jpeg;base64,/);
  expect(JSON.stringify(calls[0].messages)).not.toContain('"home"');
  expect(runs[0].output).toBeNull();expect(JSON.stringify(runs)).not.toContain('base64');expect(JSON.stringify(runs)).not.toContain(observation.caption);
  expect((await store.memories(owner,memory.crewId)).find(m=>m.id===memory.id)?.caption).toBe('My original caption');
});
it('does not allow another crew member or an unknown user to process the uploader photo',async()=>{
  const {view}=await store.museContext();const other=view.crewMemberIds(memory.crewId).find(id=>id!==owner)!;
  await expect(analyze(memory.id,other)).rejects.toMatchObject({status:404});
  await expect(analyze('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({status:404});expect(calls).toHaveLength(0);
});
it('declines corrupt media and arbitrary seeded/public image URLs',async()=>{
  const {db}=await store.museContext();const row=db.memories.find(m=>m.id===memory.id)!;row.photoUrl='https://private.invalid/anything';
  await expect(analyze()).rejects.toMatchObject({status:404});expect(calls).toHaveLength(0);
});
it('rechecks permission after a delayed response',async()=>{
  setMuseTransport(async()=>{const {db}=await store.museContext();db.crewMembers.splice(0,db.crewMembers.length);return{content:JSON.stringify(observation),usage:{promptTokens:null,completionTokens:null}};});
  await expect(analyze()).rejects.toMatchObject({status:404});
});
it('never saves generated captions automatically or creates duplicate photos on regeneration',async()=>{
  await analyze();await analyze();
  const rows=(await store.memories(owner,memory.crewId)).filter(m=>m.id===memory.id);expect(rows).toHaveLength(1);expect(rows[0].caption).toBe('My original caption');
  const accepted=await store.updateMemoryCaption(owner,memory.id,'My edited caption');
  expect(accepted).toMatchObject({id:memory.id,caption:'My edited caption',photoUrl:memory.photoUrl});
  expect((await store.memories(owner,memory.crewId)).filter(m=>m.id===memory.id)).toHaveLength(1);
  await expect(store.updateMemoryCaption(profileId('maya'),memory.id,'Unwanted edit')).rejects.toMatchObject({status:404});
});
it('validates model output and keeps provider/private error content out of logs',async()=>{
  setMuseTransport(async()=>{throw Error('PRIVATE_IMAGE_OR_PROMPT');});
  await expect(analyze()).rejects.toMatchObject({status:502});expect(JSON.stringify(runs)).not.toContain('PRIVATE_IMAGE');
  setMuseTransport(async()=>({content:JSON.stringify({...observation,caption:'<b>bad</b>'}),usage:{promptTokens:null,completionTokens:null}}));
  await expect(analyze()).rejects.toMatchObject({status:502});
});
it('explicitly marks offline mode without claiming image understanding',async()=>{
  vi.stubEnv('MUSE_MOCK','1');const result=await analyze();expect(result.mode).toBe('mock');expect(result.caption).toBeNull();expect(result.observation).toContain('not been analyzed');expect(calls).toHaveLength(0);
});
it('propagates cancellation to the actual model transport',async()=>{
  let start!:()=>void,network:AbortSignal|undefined;const started=new Promise<void>(r=>{start=r;});
  setMuseTransport(r=>{network=r.signal;start();return new Promise(()=>{});});
  const ctrl=new AbortController(),pending=analyze(memory.id,owner,ctrl.signal);await started;ctrl.abort();
  await expect(pending).rejects.toMatchObject({status:499});expect(network?.aborted).toBe(true);
});
it('bounds a slow vision call and leaves the already-saved photo intact',async()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
  let start!:()=>void;const started=new Promise<void>(r=>{start=r;});
  setMuseTransport(()=>{start();return new Promise(()=>{});});
  const pending=analyze();const rejected=expect(pending).rejects.toMatchObject({status:504});
  await started;await vi.advanceTimersByTimeAsync(14001);await rejected;
  expect((await store.memories(owner,memory.crewId)).filter(m=>m.id===memory.id)).toHaveLength(1);
});
