'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {currentPersona} from '@/features/data';
import {Button} from '@/features/ui';
import {usePhotoAnalysis,transitionSavedPhoto} from '@/features/muse-vision';
import type {Memory} from '@/shared';

export function SavedPhotoReview({memory,onChange}:{memory:Memory;onChange:(memory:Memory)=>void}){
  const photo=useRef<HTMLImageElement>(null),revision=useRef(0),requested=useRef(0);
  const [draft,setDraft]=useState(memory.caption),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState<string|null>(null);
  const {result,pending,error,analyze,cancel,accept}=usePhotoAnalysis(memory.id);
  useEffect(()=>{if(result?.caption&&requested.current===revision.current)setDraft(result.caption);},[result]);
  const ask=()=>{requested.current=revision.current;void analyze(photo.current);};
  const save=async()=>{setSaving(true);setSaveError(null);try{const updated=await accept(draft);if(updated)onChange(updated);}catch{setSaveError('Couldn’t update the caption. Your photo is saved; try again.');}finally{setSaving(false);}};
  return <div data-testid="saved-photo-review" className="space-y-3">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img ref={photo} src={`${memory.photoUrl}?as=${encodeURIComponent(currentPersona())}`} alt={memory.caption||'Saved hangout photo'} width={800} height={600} className="max-h-64 w-full object-contain"/>
    <p role="status" className="text-sm text-fb-text-2">Photo saved to your crew album.</p>
    <div className="flex items-center gap-3">
      <Button variant="secondary" disabled={pending||saving} onClick={ask}>{pending?'Looking at your photo…':result?'Ask Muse again':'Ask Muse for a caption'}</Button>
      {pending&&<button type="button" onClick={cancel} className="min-h-10 px-2 text-sm font-semibold text-fb-blue">Cancel</button>}
    </div>
    {result&&<p className="text-sm text-fb-text" data-testid="photo-observation">{result.mode==='mock'?'Offline: ':''}{result.observation}</p>}
    {result?.caption&&requested.current!==revision.current&&draft!==result.caption&&<button type="button" className="min-h-10 text-sm font-semibold text-fb-blue" onClick={()=>setDraft(result.caption!)}>Use suggested caption</button>}
    <label className="block text-sm font-semibold">Caption<input aria-label="Saved photo caption" value={draft} maxLength={500} onChange={e=>{revision.current++;setDraft(e.target.value);}} className="mt-1 w-full rounded-btn border border-fb-divider bg-fb-surface px-3 py-2 font-normal"/></label>
    {(error||saveError)&&<p role="alert" className="text-sm text-fb-red">{error||saveError}</p>}
    <div className="flex flex-wrap items-center gap-3">
      {draft!==memory.caption&&<Button disabled={saving} onClick={()=>void save()}>{saving?'Saving caption…':'Save caption'}</Button>}
      <Link href={`/memories#crew-${memory.crewId}`} className="inline-flex min-h-10 items-center text-sm font-semibold text-fb-blue" onClick={()=>{cancel();void transitionSavedPhoto(photo.current,null);}}>View memory</Link>
    </div>
  </div>;
}
