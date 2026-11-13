import {beforeEach,afterEach,expect,it,vi} from 'vitest';
vi.mock('@/features/data',()=>({currentPersona:()=> 'alex'}));
vi.mock('@/features/outhere',()=>({requestPlan:vi.fn(),setPlanOpen:vi.fn(),setPlanStatus:vi.fn(),setPlanSuggestions:vi.fn(),errorText:()=> 'Error'}));
import {openChat,closeChat,sendAgentMessage,getCompanionForTests,resetCompanionForTests,finishAgentEncounter,attachMuseWorld} from './controller';
import type {AgentEvent,AgentTransport} from './encounter';
let emit:(e:AgentEvent)=>void, signal:AbortSignal, resolve:(r:{text:string;outcome:'success'|'unavailable'})=>void;
const transport:AgentTransport={source:'backend',run:(_t,_r,s,e)=>{emit=e;signal=s;return new Promise(r=>resolve=r);}};
beforeEach(()=>{vi.useFakeTimers();resetCompanionForTests();attachMuseWorld();openChat();});
afterEach(()=>{resetCompanionForTests();vi.useRealTimers();});
it('creates no peer before authorization; recipient and duplicate events cannot invent messages',async()=>{
 expect(sendAgentMessage('Food?',{id:'maya',name:'Maya'},transport)).toBe(true);await Promise.resolve();
 expect(getCompanionForTests().encounter).toBeNull();
 emit({id:'wrong',type:'accepted',recipientId:'someone-else'});expect(getCompanionForTests().encounter).toBeNull();
 emit({id:'a',type:'accepted',recipientId:'maya'});
 emit({id:'m1',type:'sent',recipientId:'maya'});emit({id:'m1',type:'sent',recipientId:'maya'});
 expect(getCompanionForTests().encounter?.messages).toEqual(['sent']);
 vi.advanceTimersByTime(10000);expect(getCompanionForTests().encounter?.messages).toEqual(['sent']);
 resolve({text:'Maya did not agree to meet.',outcome:'unavailable'});await vi.advanceTimersByTimeAsync(0);
 expect(getCompanionForTests().encounter?.outcome).toBe('unavailable');
 expect(getCompanionForTests().messages.at(-1)?.text).toBe('Maya did not agree to meet.');
});
it('rejects overlapping requests and ignores late completion after close',async()=>{
 sendAgentMessage('One',{id:'maya',name:'Maya'},transport);await Promise.resolve();emit({id:'a',type:'accepted',recipientId:'maya'});
 expect(sendAgentMessage('Two',{id:'other',name:'Other'},transport)).toBe(false);
 closeChat();expect(signal.aborted).toBe(true);
 resolve({text:'Stale',outcome:'success'});await Promise.resolve();
 expect(getCompanionForTests().messages.some(m=>m.text==='Stale')).toBe(false);
 expect(getCompanionForTests().encounter?.outcome).toBe('cancelled');
});
it('times out accurately and cancels when its renderer is dismissed',async()=>{
 sendAgentMessage('One',{id:'maya',name:'Maya'},transport);await Promise.resolve();emit({id:'a',type:'accepted',recipientId:'maya'});
 vi.advanceTimersByTime(25000);expect(signal.aborted).toBe(true);expect(getCompanionForTests().encounter?.outcome).toBe('error');
 finishAgentEncounter(getCompanionForTests().encounter!.id);expect(getCompanionForTests().encounter).toBeNull();
});
it('skips the visual encounter without discarding its pending result',async()=>{
 sendAgentMessage('One',{id:'maya',name:'Maya'},transport);await Promise.resolve();emit({id:'a',type:'accepted',recipientId:'maya'});
 finishAgentEncounter(getCompanionForTests().encounter!.id);
 expect(signal.aborted).toBe(false);expect(getCompanionForTests().encounter).toBeNull();
 resolve({text:'Still delivered',outcome:'success'});await vi.advanceTimersByTimeAsync(0);
 expect(getCompanionForTests().messages.at(-1)?.text).toBe('Still delivered');
});
it('cannot activate the development simulation outside its explicit development context',()=>{
 expect(sendAgentMessage('One',{id:'maya',name:'Maya'},{...transport,source:'simulation'})).toBe(false);
 expect(getCompanionForTests().encounter).toBeNull();expect(getCompanionForTests().messages).toHaveLength(0);
});
