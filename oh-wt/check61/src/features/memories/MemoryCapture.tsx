'use client';

import Link from 'next/link';
import { Camera, Sparkles } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
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
  return (
    <form className="mt-4 space-y-3 rounded-card bg-fb-bg p-3" onSubmit={save}>
      <label htmlFor={inputId} className="flex items-center gap-2 text-sm font-semibold"><Camera size={16} aria-hidden />Take a photo together</label>
      <input key={inputKey} id={inputId} type="file" accept="image/*" capture="environment" disabled={!!pending}
        className="block w-full text-sm file:mr-2 file:rounded-btn file:border-0 file:bg-fb-surface file:px-3 file:py-2 file:font-semibold"
        onChange={(event) => { const f = event.currentTarget.files?.[0] ?? null; if (f) flash(); setPhoto(f); setError(null); }} />
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={preview} src={preview} alt="Photo preview" className="max-h-48 w-full animate-polaroid rounded-btn bg-fb-surface object-contain p-1.5 shadow-card" />
      )}
      <p className="text-sm text-fb-text-2">Shared with the people from this hangout.</p>
      <label className="block space-y-1 text-sm font-semibold">
        <span>Caption (optional)</span>
        <input value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={500} disabled={!!pending}
          className="w-full rounded-btn border border-fb-divider bg-fb-surface px-3 py-2 font-normal" />
      </label>
      {error && <p role="alert" className="text-sm text-fb-red">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!photo || !!pending}>{pending === 'save' ? 'Saving…' : 'Save to crew album'}</Button>
        <Button type="button" variant="tint" icon={<Sparkles size={16} />} disabled={!!pending} onClick={suggestCaption}>
          {pending === 'caption' ? 'Thinking…' : 'Suggest caption'}
        </Button>
      </div>
    </form>
  );
}
