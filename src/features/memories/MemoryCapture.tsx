'use client';

import Link from 'next/link';
import { Camera, Image as ImageIcon, Lock, Sparkles } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { apiFetch, apiPost } from '@/features/data';
import { Button, burst, flash } from '@/features/ui';
import type { CompleteQuestResponse, Memory } from '@/shared';

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

/**
 * Photo upload to the hangout's crew album. With `onMemory`, the form stays open after each save
 * (the arrival selfie and the rating questionnaire take over) and reports each saved memory.
 */
export function MemoryCapture({ questId, crewId, onSaved, onMemory }: {
  questId: string; crewId: string | null; onSaved: (id: string) => void; onMemory?: (memory: Memory) => void;
}) {
  const inputId = useId();
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [pending, setPending] = useState<'save' | 'caption' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedCrew, setSavedCrew] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const savedRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (savedCrew) burst(savedRef.current, ['📸', '✨', '💛'], 10); }, [savedCrew]);

  useEffect(() => {
    if (!photo) { setPreview(null); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function suggestCaption() {
    setPending('caption');
    setError(null);
    try {
      const response = await apiPost<{ caption: string }>('/api/muse/caption', { questId });
      setCaption(response.caption);
    } catch {
      setError('Muse couldn’t suggest a caption. You can write one or save the photo as is.');
    } finally {
      setPending(null);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!photo || pending) return;
    setPending('save');
    setError(null);
    try {
      const file = await preparePhoto(photo);
      const id = crewId ?? (await apiPost<CompleteQuestResponse>(`/api/quests/${questId}/complete`, {})).crew.id;
      onSaved(id);
      const form = new FormData();
      form.set('photo', file, file instanceof File ? file.name : 'hangout.jpg');
      form.set('questId', questId);
      form.set('crewId', id);
      form.set('caption', caption);
      const { memory } = await apiFetch<{ memory: Memory }>('/api/memories', { method: 'POST', body: form });
      setPhoto(null);
      if (onMemory) {
        onMemory(memory);
        setCaption('');
        setInputKey((k) => k + 1);
      } else setSavedCrew(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save your photo.');
    } finally {
      setPending(null);
    }
  }

  if (savedCrew) return (
    <p ref={savedRef} role="status" className="mt-4 animate-pop-in rounded-card bg-fb-blue-tint p-3 text-sm text-fb-text">
      Photo saved to your crew album. <Link href={`/memories#crew-${savedCrew}`} className="font-semibold text-fb-blue hover:underline">View memory</Link>
    </p>
  );
  // One step at a time: take or choose a photo first; the caption, Muse's suggestion and Save
  // appear only once there is a photo to save.
  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const f = event.currentTarget.files?.[0] ?? null;
    if (f) flash();
    setPhoto(f);
    setError(null);
  };
  const pickerLabel = 'oh-press inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-btn px-4 text-[15px] font-semibold peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-fb-blue';
  return (
    <form className="mt-3 space-y-3" onSubmit={save}>
      {!photo ? (
        <div className="flex flex-wrap gap-2">
          <span className="relative">
            <input key={`c${inputKey}`} id={inputId} type="file" accept="image/*" capture="user" disabled={!!pending} onChange={pick} className="peer sr-only" />
            <label htmlFor={inputId} className={`${pickerLabel} bg-fb-blue text-white hover:bg-fb-blue-hover`}>
              <Camera size={18} aria-hidden />Take a photo together
            </label>
          </span>
          <span className="relative">
            <input key={`l${inputKey}`} id={`${inputId}-lib`} type="file" accept="image/*" disabled={!!pending} onChange={pick} className="peer sr-only" />
            <label htmlFor={`${inputId}-lib`} className={`${pickerLabel} bg-fb-secondary-btn text-fb-text hover:brightness-95`}>
              <ImageIcon size={18} aria-hidden />Choose a photo
            </label>
          </span>
        </div>
      ) : (
        <>
          {preview && (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={preview} src={preview} alt="Photo preview" className="max-h-56 w-full animate-polaroid rounded-btn bg-fb-bg object-contain p-1.5 shadow-card" />
              <button type="button" disabled={!!pending} onClick={() => { setPhoto(null); setInputKey((k) => k + 1); }}
                className="absolute right-2 top-2 rounded-pill bg-[#1C1E21]/70 px-3 py-1 text-[13px] font-semibold text-white hover:bg-[#1C1E21]/85">
                Retake
              </button>
            </div>
          )}
          <label className="block space-y-1 text-sm font-semibold">
            <span>Caption (optional)</span>
            <span className="flex gap-2">
              <input value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={500} disabled={!!pending}
                className="min-w-0 flex-1 rounded-btn border border-fb-divider bg-fb-surface px-3 py-2 font-normal" />
              <Button type="button" variant="tint" icon={<Sparkles size={16} />} disabled={!!pending} onClick={suggestCaption} aria-label="Suggest caption">
                {pending === 'caption' ? 'Thinking…' : 'Suggest'}
              </Button>
            </span>
          </label>
          <p className="flex items-center gap-1.5 text-[13px] text-fb-text-2"><Lock size={13} aria-hidden />Only the people from this hangout can see it.</p>
          <Button type="submit" className="w-full" disabled={!!pending}>{pending === 'save' ? 'Saving…' : 'Save to crew album'}</Button>
        </>
      )}
      {error && <p role="alert" className="text-sm text-fb-red">{error}</p>}
    </form>
  );
}
