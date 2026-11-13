'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {PERSONA_EVENT,currentPersona} from '@/features/data';
import {requestPhotoAnalysis,savePhotoCaption} from './client';
import type {PhotoResult} from './protocol';

export function usePhotoAnalysis(memoryId:string|null){
  const [result,setResult]=useState<PhotoResult|null>(null),[error,setError]=useState<string|null>(null),[pending,setPending]=useState(false);
  const active=useRef<{id:number;ctrl:AbortController}|null>(null),sequence=useRef(0);
  const captionSave=useRef<AbortController|null>(null);
  const selected=useRef(memoryId);selected.current=memoryId;
  const cancel=useCallback(()=>{active.current?.ctrl.abort();active.current=null;sequence.current++;setPending(false);},[]);
  useEffect(()=>{
    setResult(null);setError(null);setPending(false);
    const clear=()=>{cancel();captionSave.current?.abort();captionSave.current=null;setResult(null);setError(null);};
    window.addEventListener(PERSONA_EVENT,clear);window.addEventListener('pagehide',clear);
    return()=>{active.current?.ctrl.abort();active.current=null;captionSave.current?.abort();captionSave.current=null;window.removeEventListener(PERSONA_EVENT,clear);window.removeEventListener('pagehide',clear);};
  },[memoryId,cancel]);
  const analyze=useCallback(async(photo?:HTMLElement|null,focus?:(photo:HTMLElement|null)=>void)=>{
    if(!memoryId)return null;
    cancel();setError(null);setResult(null);setPending(true);
    const id=++sequence.current,ctrl=new AbortController(),owner=currentPersona();active.current={id,ctrl};
    try{
      const next=await requestPhotoAnalysis(memoryId,{signal:ctrl.signal,photo,focus});
      if(active.current?.id!==id||owner!==currentPersona()||selected.current!==memoryId)return null;
      setResult(next);return next;
    }catch(err){
      if(active.current?.id===id&&!ctrl.signal.aborted&&(err as Error)?.name!=='AbortError')setError('Muse couldn’t examine this photo. Your photo is saved; try again.');
      return null;
    }finally{if(active.current?.id===id){active.current=null;setPending(false);}}
  },[memoryId,cancel]);
  const accept=useCallback(async(caption:string)=>{
    if(!memoryId)return null;
    captionSave.current?.abort();const ctrl=new AbortController();captionSave.current=ctrl;
    try{return await savePhotoCaption(memoryId,caption,ctrl.signal);}catch(err){if(ctrl.signal.aborted)return null;throw err;}finally{if(captionSave.current===ctrl)captionSave.current=null;}
  },[memoryId]);
  return {result,error,pending,analyze,cancel,accept};
}
