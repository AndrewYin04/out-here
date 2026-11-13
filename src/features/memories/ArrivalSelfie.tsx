'use client';
import {useEffect,useState} from 'react';
import {Button,Modal} from '@/features/ui';
import {formatDemoTime,type Quest,type Memory} from '@/shared';
import {MemoryCapture} from './MemoryCapture';
import {SavedPhotoReview} from './SavedPhotoReview';

/** Current supported arrival flow. Dashboard can embed the same capture/review components. */
export function ArrivalSelfie({quest,onClose}:{quest:Quest|null;onClose:()=>void}){
  return <Modal open={!!quest} onClose={onClose} title={quest?`At ${quest.venueName}`:'Photo'} size="md">{quest&&<Body key={quest.id} quest={quest}/>}</Modal>;
}
function Body({quest}:{quest:Quest}){
  const [now,setNow]=useState(Date.now),[crew,setCrew]=useState<string|null>(null),[memory,setMemory]=useState<Memory|null>(null);
  const [ratingMissing,setRatingMissing]=useState(false);
  useEffect(()=>{if(Date.parse(quest.startsAt)<=Date.now())return;const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[quest.startsAt]);
  if(Date.parse(quest.startsAt)>now)return <p className="text-sm">This hangout starts at {formatDemoTime(quest.startsAt)}. Your photo capture will be available then.</p>;
  if(memory)return <div className="space-y-3"><SavedPhotoReview memory={memory} onChange={setMemory}/><Button variant="secondary" onClick={()=>{
    const e=new CustomEvent('outhere:rate-hangout',{detail:{questId:quest.id,crewId:memory.crewId,photoIds:[memory.id]},cancelable:true});window.dispatchEvent(e);setRatingMissing(!e.defaultPrevented);
  }}>Rate the hangout</Button>{ratingMissing&&<p className="text-sm text-fb-text-2">The rating flow is not available in this build. Your photo is saved.</p>}</div>;
  return <MemoryCapture questId={quest.id} crewId={crew} onSaved={setCrew} onMemory={setMemory}/>;
}
