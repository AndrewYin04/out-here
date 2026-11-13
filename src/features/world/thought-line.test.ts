import { expect, it, vi } from 'vitest';
vi.mock('@/features/outhere',()=>({museSteps:()=>[{key:'rank',text:'Two choices ranked'}]}));
import type { AgentEncounter, ChatMessage } from '@/features/muse-companion';
import { companionThought } from './thought-line';
const encounter={id:1,recipient:{id:'maya',name:'Maya Chen'},source:'backend',sent:0,received:0,messages:[],outcome:null} as unknown as AgentEncounter;
it('uses actual hand-off events one at a time and settles cancellation',()=>{
 expect(companionThought('sending',encounter,undefined,false)).toBe('Asking Maya’s Muse');
 expect(companionThought('sending',{...encounter,sent:1},undefined,false)).toBe('Message sent');
 expect(companionThought('receiving',{...encounter,sent:1,received:1},undefined,false)).toBe('Maya’s Muse replied');
 expect(companionThought('idle',{...encounter,outcome:'cancelled'},undefined,false)).toBeNull();
});
it('never claims agreement for unavailable or failed encounters',()=>{
 expect(companionThought('idle',{...encounter,outcome:'unavailable'},undefined,false)).toBe('No plan was confirmed.');
 expect(companionThought('error',{...encounter,outcome:'error'},undefined,false)).toContain('did not finish');
});
it('only describes real pending work and tolerates responses without optional metadata',()=>{
 expect(companionThought('thinking',null,undefined,false)).toBe('Working on your request');
 expect(companionThought('evaluating',null,undefined,false)).toBe('Looking at your photo');
 expect(companionThought('idle',null,{role:'muse',plan:{summary:'No metadata'}} as ChatMessage,true)).toBeNull();
 expect(companionThought('idle',null,undefined,false)).toBeNull();
});
it('never replays old plan recaps after the next message or an error',()=>{
 const last={role:'user',text:'A newer ask'} as ChatMessage;
 expect(companionThought('idle',null,last,true)).toBeNull();
 expect(companionThought('error',null,last,true)).toBeNull();
});
