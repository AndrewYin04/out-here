import { expect,it } from 'vitest';
import { EncounterMotion } from './encounter-motion';
it('waits at the rendezvous indefinitely without inventing completion',()=>{
 const m=new EncounterMotion();for(let i=0;i<500;i++)expect(m.update(.05,null,false)).toBe(false);
 expect(m.progress).toBe(1);expect(m.returning).toBe(false);
});
it('a fast reply still has a continuous trip and returns, without a teleport',()=>{
 const m=new EncounterMotion();let last=0,done=false;
 for(let i=0;i<100&&!done;i++){done=m.update(.05,'success',false);expect(Math.abs(m.mix-last)).toBeLessThan(.1);last=m.mix;}
 expect(done).toBe(true);expect(m.progress).toBe(0);
});
it('cancellation reverses from the current position and reduced motion skips the flight',()=>{
 const m=new EncounterMotion();for(let i=0;i<10;i++)m.update(.05,null,false);
 const at=m.progress;m.update(.05,'cancelled',false);expect(m.progress).toBeLessThan(at);
 for(let i=0;i<100;i++)m.update(.05,'cancelled',false);expect(m.progress).toBe(0);
 const r=new EncounterMotion();r.update(.05,null,true);expect(r.progress).toBe(1);
 r.update(.05,'error',true);expect(r.progress).toBe(0);
});
