import {beforeEach,afterEach,expect,it,vi} from 'vitest';
vi.mock('@/features/data',()=>({currentPersona:()=> 'alex'}));
vi.mock('@/features/outhere',()=>({requestPlan:vi.fn(),setPlanOpen:vi.fn(),setPlanStatus:vi.fn(),setPlanSuggestions:vi.fn(),errorText:()=> 'Error'}));
import{beginPhotoAnalysis,endPhotoAnalysis,closeChat,openChat,getCompanionForTests,resetCompanionForTests}from'./controller';
beforeEach(()=>{vi.useFakeTimers();resetCompanionForTests();});afterEach(()=>{resetCompanionForTests();vi.useRealTimers();});
it('uses the existing thinking/celebrating states only while a real request owns the lease',()=>{
  const ctrl=new AbortController(),id=beginPhotoAnalysis(ctrl)!;
  expect(getCompanionForTests().snap).toMatchObject({state:'evaluating',energy:'pending'});
  expect(beginPhotoAnalysis(new AbortController())).toBeNull();
  endPhotoAnalysis(id,'live');expect(getCompanionForTests().snap.state).toBe('celebrating');vi.advanceTimersByTime(700);expect(getCompanionForTests().snap.state).toBe('idle');
});
it('cancels without leaving processing energy when navigation closes an already-closed chat',()=>{
  const ctrl=new AbortController();const id=beginPhotoAnalysis(ctrl)!;closeChat();
  expect(ctrl.signal.aborted).toBe(true);expect(getCompanionForTests().snap.energy).toBe('fade');endPhotoAnalysis(id,'live');expect(getCompanionForTests().snap.state).toBe('idle');
});
it('supports rapid regeneration and ignores stale completion',()=>{
  const old=new AbortController(),first=beginPhotoAnalysis(old)!;old.abort();const second=beginPhotoAnalysis(new AbortController())!;
  expect(second).not.toBeNull();endPhotoAnalysis(first,'live');expect(getCompanionForTests().snap.state).toBe('evaluating');endPhotoAnalysis(second,'mock');expect(getCompanionForTests().snap).toMatchObject({state:'idle',energy:'fade'});
});
it('opening chat cancels the photo lease and restores chat playback',()=>{
  const ctrl=new AbortController();beginPhotoAnalysis(ctrl);openChat();expect(ctrl.signal.aborted).toBe(true);expect(getCompanionForTests().snap.energy).toBe('fade');expect(getCompanionForTests().snap.state).toBe('approaching');
});
