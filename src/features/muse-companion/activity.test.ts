import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/features/data',()=>({currentPersona:()=> 'alex'}));
vi.mock('@/features/outhere',()=>({requestPlan:vi.fn(),setPlanOpen:vi.fn(),setPlanStatus:vi.fn(),setPlanSuggestions:vi.fn(),errorText:vi.fn()}));
import { beginMuseActivity, finishMuseActivity, releaseMuseActivity, getMuseActivityForTests, getCompanionForTests, resetCompanionForTests, openChat } from './controller';
beforeEach(()=>{vi.useFakeTimers();resetCompanionForTests();});
afterEach(()=>{resetCompanionForTests();vi.useRealTimers();});
const start=(owner:string,priority:'foreground'|'background'='foreground',signal?:AbortSignal)=>beginMuseActivity({owner,source:'test',pending:'Finding plans…',priority,signal});
describe('one companion activity owner',()=>{
 it('explicit work supersedes background presentation without cancelling that fetch',()=>{
  const background=new AbortController();const first=start('refresh','background',background.signal);
  const second=start('filter');expect(second).not.toBeNull();expect(background.signal.aborted).toBe(false);
  finishMuseActivity(first,{outcome:'success',message:'Old result'});
  expect(getMuseActivityForTests()).toMatchObject({requestId:second,outcome:null});
  expect(getCompanionForTests().snap.energy).toBe('pending');
  expect(start('quiet','background')).toBeNull();
 });
 it('does not allow simultaneous foreground requests to fight, and releases on abort',()=>{
  const controller=new AbortController();const id=start('photo','foreground',controller.signal);
  expect(start('other')).toBeNull();controller.abort();
  expect(getMuseActivityForTests()).toBeNull();
  finishMuseActivity(id,{outcome:'success'});expect(getCompanionForTests().snap.energy).toBe('fade');
  expect(start('new')).not.toBeNull();
 });
 it('shows fast results immediately; cached and offline acknowledgements do not celebrate',()=>{
  const id=start('cached');finishMuseActivity(id,{outcome:'success',cached:true,message:'Picks ready'});
  expect(getMuseActivityForTests()?.message).toBe('Picks ready');expect(getCompanionForTests().snap.energy).toBe('fade');
  vi.advanceTimersByTime(1400);expect(getMuseActivityForTests()).toBeNull();
  const mock=start('mock');finishMuseActivity(mock,{outcome:'success',live:false});expect(getCompanionForTests().snap.energy).toBe('fade');
 });
 it('surface cleanup dismisses a completed acknowledgement immediately',()=>{
  const ctrl=new AbortController();const id=start('surface','foreground',ctrl.signal);finishMuseActivity(id,{outcome:'success',message:'Ready'});ctrl.abort();
  expect(getMuseActivityForTests()).toBeNull();expect(getCompanionForTests().snap.energy).toBe('fade');
 });
 it('newer ownership survives old outcome expiry and cleanup',()=>{
  const first=start('first');finishMuseActivity(first,{outcome:'success'});vi.advanceTimersByTime(500);
  const second=start('second');releaseMuseActivity(first);vi.advanceTimersByTime(5000);
  expect(getMuseActivityForTests()?.requestId).toBe(second);expect(getCompanionForTests().snap.energy).toBe('pending');
 });
 it('chat takes priority and no-result/error/cancel never imply success',()=>{
  const id=start('map');openChat();finishMuseActivity(id,{outcome:'success'});
  expect(getMuseActivityForTests()).toBeNull();expect(start('background','background')).toBeNull();
  resetCompanionForTests();
  for(const outcome of ['empty','error','cancelled'] as const){
   const next=start(outcome);finishMuseActivity(next,{outcome});expect(getCompanionForTests().snap.energy).toBe('fade');releaseMuseActivity(next);
  }
 });
});
