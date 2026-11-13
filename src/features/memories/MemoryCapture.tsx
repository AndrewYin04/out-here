'use client';

import { Camera, Image as ImageIcon, Lock } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { apiFetch, apiPost, currentPersona, PERSONA_EVENT } from '@/features/data';
import { Button, cn, flash } from '@/features/ui';
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
  const [saved,setSaved]=useState<Memory|null>(null),[inputKey,setInputKey]=useState(0);
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
  // One step at a time: take or choose a photo; then the preview, an optional caption, who can see
  // it, and Save. After saving, Muse can look at the photo and suggest a caption (SavedPhotoReview).
  const pick=(e:ChangeEvent<HTMLInputElement>)=>{const f=e.currentTarget.files?.[0]??null;if(f)flash();setPhoto(f);setError(null);};
  const picker='oh-press inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-btn px-4 text-[15px] font-semibold peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-fb-blue';
  return <form className="mt-3 space-y-3" onSubmit={save}>
    {!photo?(

      <div className="flex flex-wrap gap-2">
        <span className="relative">
          <input key={`c${inputKey}`} id={inputId} type="file" accept="image/*" capture="user" disabled={pending} onChange={pick} className="peer sr-only"/>
          <label htmlFor={inputId} className={`${picker} bg-fb-blue text-white hover:bg-fb-blue-hover`}><Camera size={18} aria-hidden/>Take a photo together</label>
        </span>
        <span className="relative">
          <input key={`l${inputKey}`} id={`${inputId}-lib`} type="file" accept="image/*" disabled={pending} onChange={pick} className="peer sr-only"/>
          <label htmlFor={`${inputId}-lib`} className={`${picker} bg-fb-secondary-btn text-fb-text hover:brightness-95`}><ImageIcon size={18} aria-hidden/>Choose a photo</label>
        </span>
      </div>
    ):(
      <>
        {preview&&(
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Photo preview" width={800} height={600} className="max-h-56 w-full animate-polaroid rounded-btn bg-fb-bg object-contain p-1.5 shadow-card"/>
            <button type="button" disabled={pending} onClick={()=>{setPhoto(null);setInputKey(k=>k+1);}}
              className="absolute right-2 top-2 rounded-pill bg-[#1C1E21]/70 px-3 py-1 text-[13px] font-semibold text-white hover:bg-[#1C1E21]/85">Retake</button>
          </div>
        )}
        <label className="block text-sm font-semibold">Caption (optional)<input value={caption} maxLength={500} disabled={pending} onChange={e=>setCaption(e.target.value)} className="mt-1 w-full rounded-btn border border-fb-divider bg-fb-surface px-3 py-2 font-normal"/></label>
        <p className="flex items-center gap-1.5 text-[13px] text-fb-text-2"><Lock size={13} aria-hidden/>Only the people from this hangout can see it.</p>
        <Button type="submit" className="w-full" disabled={pending}>{pending?'Saving…':'Save to crew album'}</Button>
      </>
    )}
    {error&&<p role="alert" className="text-sm text-fb-red">{error}</p>}
  </form>;
}

/** Uploads one photo to the hangout's crew album, completing the quest first when it has no crew yet. */
async function uploadPhoto(photo: File, questId: string, crewId: string | null, caption: string): Promise<{ crewId: string; memory: Memory }> {
  const file = await preparePhoto(photo);
  const id = crewId ?? (await apiPost<CompleteQuestResponse>(`/api/quests/${questId}/complete`, {})).crew.id;
  const form = new FormData();
  form.set('photo', file, file instanceof File ? file.name : 'hangout.jpg');
  form.set('questId', questId);
  form.set('crewId', id);
  form.set('caption', caption);
  const { memory } = await apiFetch<{ memory: Memory }>('/api/memories', { method: 'POST', body: form });
  return { crewId: id, memory };
}

/** The rating questionnaire's photo step (kept for RateHangout): picks upload straight to the crew album. */
export function AddPhotoTile({ questId, crewId, onMemory }: {
  questId: string; crewId: string | null; onMemory: (memory: Memory) => void;
}) {
  const inputId = useId();
  const [crew, setCrew] = useState(crewId);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  async function pick(files: FileList | null) {
    const list = [...(files ?? [])];
    setInputKey((k) => k + 1);
    if (!list.length) return;
    setError(null);
    setUploading(true);
    let id = crew;
    try {
      for (const f of list) {
        const res = await uploadPhoto(f, questId, id, '');
        id = res.crewId;
        setCrew(id);
        onMemory(res.memory);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save your photo.');
    } finally {
      setUploading(false);
    }
  }
  return (
    <div>
      <input key={inputKey} id={inputId} type="file" accept="image/*" multiple className="peer sr-only"
        aria-label="Take a photo together" disabled={uploading}
        onChange={(event) => { void pick(event.currentTarget.files); }} />
      <label htmlFor={inputId} data-testid="add-photos-tile" aria-hidden
        className={cn(
          'flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1 rounded-[16px] border-2 border-dashed border-fb-divider bg-fb-input px-4 py-3 text-center hover:bg-fb-secondary-btn peer-focus-visible:ring-2 peer-focus-visible:ring-fb-blue',
          uploading && 'pointer-events-none opacity-70',
        )}>
        <Camera size={24} aria-hidden className="text-fb-text" />
        <span className="text-[15px] font-semibold text-fb-text">{uploading ? 'Adding photo…' : 'Add photos'}</span>
        <span className="text-[13px] text-fb-text-2">Shared with the people from this hangout</span>
      </label>
      {error && <p role="alert" className="mt-2 text-[13px] text-fb-red">{error}</p>}
    </div>
  );
}
