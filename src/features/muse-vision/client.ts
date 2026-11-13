'use client';
import {apiFetch,currentPersona} from '@/features/data';
import {beginPhotoAnalysis,endPhotoAnalysis,setPhotoAnalysisTarget} from '@/features/muse-companion';
import {PhotoResultZ,type PhotoResult} from './protocol';
import {startPhotoScan} from './presentation';
import type {Memory} from '@/shared';
let focusedRequest:AbortController|null=null;

/** Call only after POST /api/memories succeeds, in response to explicit user intent. */
export async function requestPhotoAnalysis(memoryId:string,options:{signal:AbortSignal;photo?:HTMLElement|null;focus?:(photo:HTMLElement|null)=>void}):Promise<PhotoResult>{
  const owner=currentPersona();
  const ctrl=new AbortController(),abort=()=>ctrl.abort();
  options.signal.addEventListener('abort',abort,{once:true});if(options.signal.aborted)abort();
  const id=beginPhotoAnalysis(ctrl);
  if(id===null){options.signal.removeEventListener('abort',abort);throw new Error('Muse is busy. Try again when the current request finishes.');}
  let stop=()=>{};
  let stopTarget=()=>{};
  const timer=setTimeout(()=>ctrl.abort(new DOMException('Photo analysis timed out','TimeoutError')),22000);
  try{
    ctrl.signal.throwIfAborted();
    // Fetch starts before presentation. Navigation or another active controller can cancel it.
    const pending=apiFetch('/api/muse/caption',{method:'POST',body:JSON.stringify({memoryId,consent:true}),signal:ctrl.signal});
    if(options.photo){
      const el=options.photo;
      const measure=()=>setPhotoAnalysisTarget(id,el.isConnected?el.getBoundingClientRect():null);
      measure();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);observer?.observe(el);
      window.addEventListener('scroll',measure,{capture:true,passive:true});window.addEventListener('resize',measure,{passive:true});
      stopTarget=()=>{observer?.disconnect();window.removeEventListener('scroll',measure,true);window.removeEventListener('resize',measure);};
      try{stop=startPhotoScan(options.photo,ctrl.signal);focusedRequest=ctrl;options.focus?.(options.photo);}catch{/* presentation cannot block analysis */}
    }
    const result=PhotoResultZ.parse(await pending);
    if(owner!==currentPersona()){ctrl.abort();throw new DOMException('Persona changed','AbortError');}
    ctrl.signal.throwIfAborted();
    if(result.memoryId!==memoryId)throw new Error('Photo response did not match this memory.');
    endPhotoAnalysis(id,result.mode);
    ctrl.signal.throwIfAborted();
    if(owner!==currentPersona())throw new DOMException('Persona changed','AbortError');
    return result;
  }catch(err){endPhotoAnalysis(id,ctrl.signal.aborted?'cancelled':'error');throw err;}
  finally{
    clearTimeout(timer);stop();stopTarget();
    if(focusedRequest===ctrl){focusedRequest=null;try{options.focus?.(null);}catch{/* presentation only */}}
    options.signal.removeEventListener('abort',abort);
  }
}

/** Explicit accept/edit action. No upload, insertion, sharing change or automatic posting. */
export async function savePhotoCaption(memoryId:string,caption:string,signal?:AbortSignal):Promise<Memory>{
  const owner=currentPersona();
  const result=await apiFetch<{memory:Memory}>(`/api/memories/${encodeURIComponent(memoryId)}`,{method:'PATCH',body:JSON.stringify({caption}),signal});
  signal?.throwIfAborted();
  if(owner!==currentPersona())throw new DOMException('Persona changed','AbortError');
  if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('outhere:memory-saved',{detail:{memoryId,crewId:result.memory.crewId,questId:result.memory.questId}}));
  return result.memory;
}
