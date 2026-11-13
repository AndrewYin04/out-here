import{beforeEach,afterEach,expect,it,vi}from'vitest';
const {api,begin,end}=vi.hoisted(()=>({api:vi.fn(),begin:vi.fn(),end:vi.fn()}));
let persona='alex';
vi.mock('@/features/data',()=>({apiFetch:api,currentPersona:()=>persona}));
vi.mock('@/features/muse-companion',()=>({beginPhotoAnalysis:begin,endPhotoAnalysis:end}));
import{requestPhotoAnalysis,savePhotoCaption}from'./client';
const id='00000000-0000-4000-8000-000000000001';
const result={memoryId:id,source:'vision',mode:'live',observation:'Two cups on a table.',caption:'At the table.',reaction:null,clarity:'clear'};
beforeEach(()=>{persona='alex';api.mockReset();begin.mockReset().mockReturnValue(1);end.mockReset();});afterEach(()=>vi.useRealTimers());
it('starts only on explicit request, sends only the saved id and consent, and validates its result',async()=>{
  expect(api).not.toHaveBeenCalled();api.mockResolvedValue(result);
  expect(await requestPhotoAnalysis(id,{signal:new AbortController().signal})).toEqual(result);
  const [path,options]=api.mock.calls[0];expect(path).toBe('/api/muse/caption');expect(JSON.parse(options.body)).toEqual({memoryId:id,consent:true});expect(end).toHaveBeenCalledWith(1,'live');
});
it('cancellation and stale/mismatched photo results cannot celebrate',async()=>{
  let finish!:(v:unknown)=>void;api.mockImplementation(()=>new Promise(r=>{finish=r;}));
  const ctrl=new AbortController(),pending=requestPhotoAnalysis(id,{signal:ctrl.signal});
  ctrl.abort();finish(result);await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(end).toHaveBeenLastCalledWith(1,'cancelled');
  api.mockResolvedValue({...result,memoryId:'00000000-0000-4000-8000-000000000002'});
  await expect(requestPhotoAnalysis(id,{signal:new AbortController().signal})).rejects.toThrow('did not match');expect(end).toHaveBeenLastCalledWith(1,'error');
});
it('never changes caption until accept is called, and preserves another persona after a delayed save',async()=>{
  api.mockResolvedValue(result);await requestPhotoAnalysis(id,{signal:new AbortController().signal});expect(api.mock.calls).toHaveLength(1);
  api.mockResolvedValue({memory:{id,caption:'Edited',crewId:'crew',questId:'quest'}});
  await savePhotoCaption(id,'Edited');expect(api.mock.calls[1][1].method).toBe('PATCH');
  let finish!:(v:unknown)=>void;api.mockImplementation(()=>new Promise(r=>{finish=r;}));const pending=savePhotoCaption(id,'Private');persona='maya';finish({memory:{id,crewId:'crew',questId:'quest'}});await expect(pending).rejects.toMatchObject({name:'AbortError'});
});
it('does not start networking when another interaction owns Muse',async()=>{
  begin.mockReturnValue(null);await expect(requestPhotoAnalysis(id,{signal:new AbortController().signal})).rejects.toThrow('busy');expect(api).not.toHaveBeenCalled();
});
it('direct helper consumers cannot receive another persona’s delayed private result',async()=>{
  let finish!:(v:unknown)=>void;api.mockImplementation(()=>new Promise(r=>{finish=r;}));
  const pending=requestPhotoAnalysis(id,{signal:new AbortController().signal});persona='maya';finish(result);
  await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(end).toHaveBeenLastCalledWith(1,'cancelled');
});
