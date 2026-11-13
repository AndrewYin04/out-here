'use client';

// Camera-first capture: a live viewfinder (MediaDevices.getUserMedia) with a shutter button, and
// "Choose a photo" for devices or browsers without camera access. It only reports a photo
// (onPhoto) after a frame was really captured or a file really decoded and re-encoded; a denied
// permission or a missing camera shows what happened and the file option instead.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, RefreshCw } from 'lucide-react';
import { Button } from '@/features/ui';
import { MAX_EDGE, PhotoError, prepareImage } from './imageTools';

type CamState = 'starting' | 'live' | 'denied' | 'nodevice' | 'unsupported' | 'error';

const MESSAGES: Record<Exclude<CamState, 'starting' | 'live'>, string> = {
  denied: 'Camera access is off for this site. You can allow it in your browser settings, or choose a photo instead.',
  nodevice: 'No camera was found on this device. Choose a photo instead.',
  unsupported: 'This browser can’t open the camera here. Choose a photo instead.',
  error: 'The camera didn’t start. Try again, or choose a photo instead.',
};

export function CameraCapture({ onPhoto, disabled = false }: { onPhoto: (photo: Blob) => void; disabled?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [cam, setCam] = useState<CamState>('starting');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    setCam('starting');
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) { setCam('unsupported'); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false,
      });
      stream.current = s;
      const el = video.current;
      if (!el) { s.getTracks().forEach((t) => t.stop()); return; }
      el.srcObject = s;
      await el.play().catch(() => undefined);
      setCam('live');
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      setCam(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'nodevice' : 'error');
    }
  }, [stop]);

  useEffect(() => { void start(); return stop; }, [start, stop]);

  const shoot = async () => {
    const el = video.current;
    if (!el || cam !== 'live' || !el.videoWidth) return;
    setBusy(true);
    setNote(null);
    try {
      const scale = Math.min(1, MAX_EDGE / Math.max(el.videoWidth, el.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(el.videoWidth * scale);
      canvas.height = Math.round(el.videoHeight * scale);
      canvas.getContext('2d')?.drawImage(el, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
      if (!blob) throw new PhotoError('The photo didn’t save. Try again.');
      stop();
      onPhoto(blob);
    } catch (e) {
      setNote(e instanceof PhotoError ? e.message : 'The photo didn’t save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const choose = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setNote(null);
    try {
      const blob = await prepareImage(f);
      stop();
      onPhoto(blob);
    } catch (e) {
      setNote(e instanceof PhotoError ? e.message : 'That photo couldn’t be used. Try another.');
    } finally {
      setBusy(false);
    }
  };

  const failed = cam !== 'starting' && cam !== 'live';
  return (
    <div className="flex flex-col gap-3" data-testid="camera-capture" data-camera={cam}>
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-card bg-black md:aspect-[4/3]">
        <video ref={video} playsInline muted className={`h-full w-full object-cover ${cam === 'live' ? '' : 'invisible'}`} aria-label="Camera preview" />
        {cam === 'starting' && <p className="absolute inset-0 flex items-center justify-center text-[15px] text-white/80" role="status">Starting the camera…</p>}
        {failed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white" role="status">
            <Camera size={32} aria-hidden />
            <p className="text-[15px]">{MESSAGES[cam]}</p>
            {cam !== 'unsupported' && <Button variant="secondary" size="sm" onClick={start} icon={<RefreshCw size={14} aria-hidden />}>Try camera again</Button>}
          </div>
        )}
        {cam === 'live' && (
          <button
            type="button"
            onClick={shoot}
            disabled={disabled || busy}
            aria-label="Take photo"
            data-testid="shutter"
            className="absolute bottom-4 left-1/2 flex h-[68px] w-[68px] -translate-x-1/2 items-center justify-center rounded-full border-4 border-white bg-white/20 transition-transform active:scale-95 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <span className="h-[48px] w-[48px] rounded-full bg-white" />
          </button>
        )}
      </div>
      {note && <p className="text-[13px] text-fb-red" role="alert">{note}</p>}
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/*" hidden onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }} data-testid="photo-file" />
      <Button variant="secondary" block disabled={disabled || busy} onClick={() => file.current?.click()} icon={<ImagePlus size={16} aria-hidden />}>
        Choose a photo
      </Button>
    </div>
  );
}
