import{beforeEach,afterEach,expect,it,vi}from'vitest';
const notified=vi.hoisted(()=>vi.fn());
vi.mock('react',async(importOriginal)=>({...await importOriginal<typeof import('react')>(),useSyncExternalStore:(subscribe:(fn:()=>void)=>()=>void,get:()=>unknown)=>{subscribe(notified);return get();}}));
vi.mock('@/features/data',()=>({currentPersona:()=> 'alex'}));
const planner=vi.hoisted(()=>vi.fn());
vi.mock('@/features/outhere',()=>({requestPlan:planner,setPlanOpen:vi.fn(),setPlanStatus:vi.fn(),setPlanSuggestions:vi.fn(),errorText:()=> 'Error'}));
import{openChat,closeChat,minimizeChat,sendMessage,sendAgentMessage,getCompanionForTests,resetCompanionForTests,beginPhotoAnalysis,useMuseSnapshot}from'./controller';
beforeEach(()=>{vi.useFakeTimers();resetCompanionForTests();notified.mockClear();planner.mockReset();});afterEach(()=>{resetCompanionForTests();vi.useRealTimers();});
it('a completed 2D encounter releases chat without any renderer callback',async()=>{
  openChat();sendAgentMessage('Food?',{id:'maya',name:'Maya'},{source:'backend',async run(_t,id,_s,emit){emit({id:'a',type:'accepted',recipientId:id});return{text:'Awaiting approval',outcome:'success'};}});
  await vi.advanceTimersByTimeAsync(0);expect(getCompanionForTests().encounter).toBeNull();
  planner.mockReturnValue(new Promise(()=>{}));expect(sendMessage('Another question')).toBe(true);
});
it('dashboard collapse and reopen preserve genuine pending work',async()=>{
  openChat();let finish!:(v:unknown)=>void;planner.mockImplementation(()=>new Promise(r=>{finish=r;}));sendMessage('Food');
  const signal=planner.mock.calls[0][1] as AbortSignal;minimizeChat();expect(signal.aborted).toBe(false);
  openChat();expect(getCompanionForTests().snap.state).toBe('thinking');
  finish({plan:{summary:'A real result',suggestions:[]},museSource:'muse'});await vi.advanceTimersByTimeAsync(0);expect(getCompanionForTests().messages.at(-1)?.text).toBe('A real result');
});
it('cancelling photo processing notifies subscribers even when chat was already closed',()=>{
  useMuseSnapshot();const ctrl=new AbortController();beginPhotoAnalysis(ctrl);notified.mockClear();closeChat();
  expect(ctrl.signal.aborted).toBe(true);expect(notified).toHaveBeenCalledTimes(1);expect(getCompanionForTests().snap.energy).toBe('fade');
});
