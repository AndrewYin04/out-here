'use client';

import { Camera } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { apiFetch, currentPersona, PERSONA_EVENT } from '@/features/data';
import { Button, flash } from '@/features/ui';
import type { CompleteQuestResponse,Memory } from '@/shared';

const MAX_BYTES = 3_500_000;

async function preparePhoto(file: File): Promise<Blob> {
  if (file.size <= MAX_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) { bitmap.close(); throw new Error('Image canvas is unavailable.'); }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (result && result.size <= MAX_BYTES) return result;
  } catch { /* The picker can supply a smaller image if decoding fails. */ }
  throw new Error('Choose a smaller JPG, PNG, or WebP photo.');
}

import { SavedPhotoReview } from './SavedPhotoReview';

export function MemoryCapture({ questId, crewId, onSaved, onMemory }: {
  questId:string; crewId:string|null; onSaved:(id:string)=>void; onMemory?:(memory:Memory)=>void;
}) {
  const inputId=useId();
  const [photo,setPhoto]=useState<File|null>(null),[preview,setPreview]=useState<string|null>(null);
  const [caption,setCaption]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState<string|null>(null);
  const [saved,setSaved]=useState<Memory|null>(null);
  const upload=useRef<AbortController|null>(null);
  useEffect(()=>{const clear=()=>{upload.current?.abort();upload.current=null;setPhoto(null);setSaved(null);setCaption('');setPending(false);};window.addEventListener(PERSONA_EVENT,clear);return()=>{upload.current?.abort();upload.current=null;window.removeEventListener(PERSONA_EVENT,clear);};},[]);
  useEffect(()=>{if(!photo){setPreview(null);return;}const url=URL.createObjectURL(photo);setPreview(url);return()=>URL.revokeObjectURL(url);},[photo]);
  async function save(event:FormEvent){
    event.preventDefault();if(!photo||pending)return;setPending(true);setError(null);
    const owner=currentPersona(),ctrl=new AbortController();upload.current=ctrl;
    const valid=()=>!ctrl.signal.aborted&&currentPersona()===owner&&upload.current===ctrl;
    try{
      const file=await preparePhoto(photo);
      if(!valid())return;
      const id=crewId??(await apiFetch<CompleteQuestResponse>(`/api/quests/${questId}/complete`,{method:'POST',body:'{}',signal:ctrl.signal})).crew.id;
      if(!valid())return;
      const form=new FormData();form.set('photo',file,file instanceof File?file.name:'hangout.jpg');form.set('questId',questId);form.set('crewId',id);form.set('caption',caption);
      const {memory}=await apiFetch<{memory:Memory}>('/api/memories',{method:'POST',body:form,signal:ctrl.signal});
      if(!valid())return;
      setSaved(memory);setPhoto(null);onSaved(id);onMemory?.(memory);
      window.dispatchEvent(new CustomEvent('outhere:memory-saved',{detail:{questId,crewId:id,memoryId:memory.id}}));
    }catch(e){if(valid())setError(e instanceof Error?e.message:'Couldn’t save your photo.');}finally{if(valid()){upload.current=null;setPending(false);}}
  }
  if(saved)return <SavedPhotoReview memory={saved} onChange={setSaved}/>;
  return <form className="mt-4 space-y-3" onSubmit={save}>
    <label htmlFor={inputId} className="flex items-center gap-2 text-sm font-semibold"><Camera size={16} aria-hidden/>Take a photo together</label>
    <input id={inputId} type="file" accept="image/*" capture="environment" disabled={pending} className="block w-full text-sm file:mr-2 file:rounded-btn file:border-0 file:bg-fb-secondary-btn file:px-3 file:py-2" onChange={e=>{setPhoto(e.currentTarget.files?.[0]??null);setError(null);flash();}}/>
    {preview&&
      // eslint-disable-next-line @next/next/no-img-element
      <img src={preview} alt="Photo preview" width={800} height={600} className="max-h-48 w-full object-contain"/>
    }
    <p className="text-sm text-fb-text-2">Only the people from this hangout can see it.</p>
    <label className="block text-sm font-semibold">Caption (optional)<input value={caption} maxLength={500} onChange={e=>setCaption(e.target.value)} className="mt-1 w-full rounded-btn border border-fb-divider bg-fb-surface px-3 py-2 font-normal"/></label>
    {error&&<p role="alert" className="text-sm text-fb-red">{error}</p>}
    <Button type="submit" disabled={!photo||pending}>{pending?'Saving…':'Save to crew album'}</Button>
  </form>;
}
