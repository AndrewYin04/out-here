'use client';
// The group selfie camera (memory page): front camera with corner brackets, "N in shot", and
// everyone who was there around the shutter. No camera (a laptop on stage, or permission denied)
// falls back to the plan's photo, so the shutter always works.
import { ImagePlus, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar, cn } from '@/features/ui';
import type { Quest } from '@/shared';

export type Face = { id: string; name: string; avatarUrl: string };

/** A stand-in photo when there's no camera: the plan's own photo. */
export async function samplePhoto(quest: Pick<Quest, 'posterUrl'>): Promise<File | null> {
  const src = quest.posterUrl ?? '/seed/groups/boba-and-sketch.webp';
  try {
    const blob = await fetch(src).then((r) => (r.ok ? r.blob() : Promise.reject()));
    return new File([blob], 'together.webp', { type: blob.type || 'image/webp' });
  } catch { return null; }
}

/** Front camera with everyone who's here around the shutter. Falls back to a sample photo. */
export function SelfieCamera({ here, quest, onTake, onPickFile }: {
  here: Face[]; quest: Pick<Quest, 'posterUrl'>; onTake: (f: File) => void; onPickFile: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [camera, setCamera] = useState<'starting' | 'on' | 'off'>('starting');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setCamera('starting');
    if (!navigator.mediaDevices?.getUserMedia) { setCamera('off'); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        if (videoRef.current) { videoRef.current.srcObject = s; void videoRef.current.play().catch(() => {}); }
        setCamera('on');
      })
      .catch(() => { if (!cancelled) setCamera('off'); });
    return () => { cancelled = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [facing]);

  const shoot = async () => {
    const v = videoRef.current;
    if (camera === 'on' && v && v.videoWidth > 0) {
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      const g = c.getContext('2d');
      if (g) {
        if (facing === 'user') { g.translate(c.width, 0); g.scale(-1, 1); }
        g.drawImage(v, 0, 0);
        const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.88));
        if (blob) { onTake(new File([blob], 'together.jpg', { type: 'image/jpeg' })); return; }
      }
    }
    const sample = await samplePhoto(quest);
    if (sample) onTake(sample);
  };

  const orbit = here.slice(0, 6);
  return (
    <div className="animate-step-in">
      <div className="flex items-center justify-between">
        <h2 className="text-[20px] font-extrabold text-fb-text">Group selfie <span aria-hidden>📸</span></h2>
        <span className="rounded-full bg-fb-blue px-2.5 py-0.5 text-[13px] font-semibold text-white">{here.length} in shot</span>
      </div>
      <div className="relative mt-2 aspect-[4/3] max-h-[260px] w-full overflow-hidden rounded-[18px] bg-[#1C1E21]">
        <video ref={videoRef} muted playsInline className={cn('size-full object-cover', facing === 'user' && '[transform:scaleX(-1)]', camera !== 'on' && 'hidden')} />
        {camera !== 'on' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-[13px] text-white/80">
            {quest.posterUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- sample photo
              <img src={quest.posterUrl} alt="" className="absolute inset-0 size-full object-cover opacity-40" />
            )}
            <span className="relative">{camera === 'starting' ? 'Opening the camera…' : 'Camera is off · the shutter uses a sample photo'}</span>
          </div>
        )}
        {/* corner brackets */}
        {['left-3 top-3 border-l-2 border-t-2', 'right-3 top-3 border-r-2 border-t-2', 'bottom-3 left-3 border-b-2 border-l-2', 'bottom-3 right-3 border-b-2 border-r-2'].map((c) => (
          <span key={c} aria-hidden className={cn('absolute size-6 rounded-[4px] border-white/90', c)} />
        ))}
        <span className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-semibold text-white">
          <span aria-hidden className="mr-1 inline-block size-1.5 rounded-full bg-[#FF3B30] align-middle" />{facing === 'user' ? 'Front cam' : 'Back cam'}
        </span>
      </div>
      <div className="relative mx-auto mt-3 flex h-28 items-center justify-between px-2">
        <button type="button" aria-label="Choose a photo" onClick={onPickFile}
          className="flex size-11 items-center justify-center rounded-full bg-fb-input text-fb-text hover:bg-fb-secondary-btn"><ImagePlus size={20} aria-hidden /></button>
        <div className="relative flex size-28 items-center justify-center">
          {orbit.map((p, i) => {
            const a = (-90 + (i * 360) / orbit.length) * (Math.PI / 180);
            return (
              <span key={p.id} className="absolute animate-pop-in" style={{ left: 56 + Math.cos(a) * 50 - 14, top: 56 + Math.sin(a) * 50 - 14, animationDelay: `${i * 80}ms` }}>
                <Avatar src={p.avatarUrl} name={p.name} size={28} decorative className="ring-2 ring-[#31A24C]" />
              </span>
            );
          })}
          <button type="button" data-testid="together-shutter" aria-label="Take the photo" onClick={() => void shoot()}
            className="oh-press relative size-16 rounded-full bg-fb-blue ring-[5px] ring-fb-blue-tint shadow-[0_6px_18px_rgba(8,102,255,.45)] active:scale-95" />
        </div>
        <button type="button" aria-label="Flip camera" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
          className="flex size-11 items-center justify-center rounded-full bg-fb-input text-fb-text hover:bg-fb-secondary-btn"><RefreshCw size={20} aria-hidden /></button>
      </div>
    </div>
  );
}
