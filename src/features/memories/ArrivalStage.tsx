'use client';
// The arrival moment (design canvas "Arrival and the photo"): one full-screen beat instead of a
// sheet plus a modal.
//   A. "You made it." lands big over the map, who's here pops in, Muse says one line, and a big
//      shutter asks for the photo. "Later" folds it into the Together capsule.
//   B. The camera takes the whole screen and counts 3-2-1 (tap the shutter to go now). With no
//      camera (a laptop on stage, permission denied) it uses the plan's photo, so it always works.
//   C. Flash and click, the photo drops in as a print, Muse writes the caption, and Done sends the
//      print up into Memories.
import { Camera, Check, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch, apiPost } from '@/features/data';
import { Avatar, EASE, bump, burst, cn, flash, reducedMotion } from '@/features/ui';
import { formatDemoTime, type Memory, type Quest } from '@/shared';
import { arrivalWait, requestRating } from './arrival';
import { samplePhoto } from './SelfieCamera';
import { saveToAlbum } from './together-api';

export type ArrivalPerson = { id: string; name: string; avatarUrl: string; here: boolean; minutes: number | null; you: boolean };

const first = (n: string) => n.split(' ')[0] ?? n;
const COUNT_FROM = 3;
/** Give up waiting for the camera permission after this long and use the plan's photo. */
const CAMERA_WAIT_MS = 3500;

function names(list: string[]): string {
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

export function ArrivalStage({ quest, people, allHere, onFold, onClose }: {
  quest: Quest;
  people: ArrivalPerson[];
  allHere: boolean;
  /** Later / Done: fold into the Together capsule. */
  onFold: () => void;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<'arrive' | 'camera' | 'shot'>('arrive');
  const [shot, setShot] = useState<File | null>(null);
  const take = useCallback((f: File) => { setShot(f); setStage('shot'); }, []);

  if (stage === 'camera') return <CameraView quest={quest} onTake={take} onCancel={() => setStage('arrive')} />;
  if (stage === 'shot' && shot) return <PrintView quest={quest} file={shot} people={people} onDone={onFold} />;
  return <Arrive quest={quest} people={people} allHere={allHere} onShoot={() => setStage('camera')} onLater={onFold} onClose={onClose} />;
}

// ---- A. You made it ----

function Arrive({ quest, people, allHere, onShoot, onLater, onClose }: {
  quest: Quest; people: ArrivalPerson[]; allHere: boolean; onShoot: () => void; onLater: () => void; onClose: () => void;
}) {
  const [now] = useState(() => Date.now());
  const headRef = useRef<HTMLHeadingElement>(null);
  const shutterRef = useRef<HTMLButtonElement>(null);
  const wait = arrivalWait(quest.startsAt, now);
  const here = people.filter((p) => p.here);
  const coming = people.filter((p) => !p.here && p.minutes != null);

  // Confetti as the headline lands, and again each time someone else gets there.
  const seen = useRef(0);
  useEffect(() => {
    if (here.length <= seen.current) { seen.current = here.length; return; }
    const firstTime = seen.current === 0;
    seen.current = here.length;
    const t = window.setTimeout(() => burst(headRef.current, [quest.emoji, '🎉', '✨', '🎊'], firstTime ? 24 : 14), firstTime ? 320 : 0);
    return () => window.clearTimeout(t);
  }, [here.length, quest.emoji]);
  useEffect(() => { shutterRef.current?.focus({ preventScroll: true }); }, []);

  const startIn = Date.parse(quest.startsAt) - now;
  const when = startIn > 90_000 ? `${Math.round(startIn / 60_000)} minutes early`
    : startIn < -90_000 ? `started at ${formatDemoTime(quest.startsAt)}` : 'right on time';
  const headline = allHere && here.length > 1 ? 'You’re all here.' : 'You made it.';
  const soonest = coming.reduce<number | null>((m, p) => (p.minutes == null ? m : m == null ? p.minutes : Math.min(m, p.minutes)), null);
  const muse = wait.early
    ? `You’re early. It starts at ${formatDemoTime(quest.startsAt)}, and I’ll open the camera when it’s closer.`
    : coming.length > 0
      ? `${names(coming.map((p) => first(p.name)))} ${coming.length === 1 ? 'is' : 'are'} ${Math.max(1, soonest ?? 1)} min out. Get the photo when ${coming.length === 1 ? first(coming[0]!.name) : 'everyone'} gets here.`
      : here.length > 1 ? 'Everyone’s here. Grab the photo, then phones down.' : 'Take one to remember it, then enjoy it.';

  return (
    <section aria-label={headline} data-testid="together-moment" data-all-here={allHere ? 'true' : 'false'}
      className="pointer-events-auto absolute inset-0 z-40 overflow-hidden">
      <div aria-hidden className="absolute inset-0 animate-veil bg-[linear-gradient(to_top,#FFFFFF_0%,rgba(255,255,255,0.96)_46%,rgba(255,255,255,0.72)_66%,rgba(255,255,255,0.55)_100%)]" />
      <button type="button" aria-label="Close" onClick={onClose}
        className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/90 text-fb-text shadow-card hover:bg-white">
        <X size={20} aria-hidden />
      </button>

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-6 px-5 pb-8 md:flex-row md:items-end md:justify-between md:gap-12 md:px-16 md:pb-14">
        <div className="flex min-w-0 max-w-[780px] flex-col gap-4 md:gap-5">
          <ul aria-label="Who's here" className="flex flex-wrap items-end gap-4">
            {people.map((p, i) => (
              <li key={p.id} className="flex animate-pop-in flex-col items-center gap-1" style={{ animationDelay: `${180 + i * 90}ms` }}>
                <span className={cn('relative block rounded-full bg-white p-[3px] shadow-[0_10px_24px_rgba(8,8,9,0.18)]',
                  p.here ? 'ring-[3px] ring-[#31A24C]'
                    : p.minutes != null ? 'opacity-85 outline-dashed outline-[3px] outline-offset-0 outline-[#31A24C]'
                      : 'opacity-50 grayscale')}>
                  <Avatar src={p.avatarUrl} name={p.name} size={56} decorative />
                  {p.here && (
                    <span aria-hidden className="absolute -bottom-0.5 -right-0.5 flex size-6 items-center justify-center rounded-full bg-[#31A24C] text-white ring-[3px] ring-white">
                      <Check size={14} strokeWidth={3.5} />
                    </span>
                  )}
                </span>
                <span className="text-[13px] font-semibold text-fb-text">
                  {p.you ? 'You' : first(p.name)}{!p.here && p.minutes != null ? `, ${Math.max(1, p.minutes)}m` : ''}
                </span>
                <span className="sr-only">{p.here ? 'is here' : p.minutes != null ? `${p.minutes} min away` : 'not on the way yet'}</span>
              </li>
            ))}
          </ul>
          <h2 ref={headRef} className="animate-slam text-[64px] font-black leading-[0.92] tracking-[-0.055em] text-fb-text md:text-[120px]" style={{ animationDelay: '60ms' }}>
            {headline}
          </h2>
          <p className="animate-step-in text-[18px] font-semibold leading-snug text-[#3A3B3C] md:text-[24px]" style={{ animationDelay: '320ms' }}>
            {quest.title} at {quest.venueName}, {when}.
          </p>
          <p data-testid="arrival-muse" className="flex animate-step-in items-start gap-2 text-[16px] font-semibold leading-snug text-fb-text md:text-[19px]" style={{ animationDelay: '460ms' }}>
            <Sparkles size={20} aria-hidden className="mt-0.5 shrink-0 text-fb-blue" />
            <span><b className="font-extrabold text-fb-blue">Muse</b>{'  '}{muse}</span>
          </p>
        </div>

        <div className="flex animate-pop-in items-center gap-4 md:flex-col md:gap-3" style={{ animationDelay: '560ms' }}>
          <button ref={shutterRef} type="button" data-testid="arrival-shutter" aria-label="Take the photo" disabled={wait.early} onClick={onShoot}
            className="oh-press flex size-[92px] shrink-0 items-center justify-center rounded-full border-[6px] border-fb-blue bg-white p-[6px] shadow-[0_16px_40px_rgba(8,102,255,0.28)] disabled:opacity-40 md:size-[124px] md:p-2">
            <span className="flex size-full items-center justify-center rounded-full bg-fb-blue text-white">
              <Camera size={38} aria-hidden />
            </span>
          </button>
          <div className="flex flex-col gap-1 md:items-center">
            <span className="text-[18px] font-extrabold text-fb-text md:text-[20px]">Take the photo</span>
            <button type="button" data-testid="together-got-it" onClick={onLater} className="self-start text-[16px] font-semibold text-fb-text-2 hover:underline md:self-center">
              Later
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---- B. The camera ----

/** A short shutter click, made with Web Audio so there's no file to load. */
function shutterClick() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const len = Math.floor(ctx.sampleRate * 0.09);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0.45;
    src.connect(gain).connect(ctx.destination);
    src.onended = () => { void ctx.close(); };
    src.start();
  } catch { /* no sound is fine */ }
}

function CameraView({ quest, onTake, onCancel }: { quest: Quest; onTake: (f: File) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shutterRef = useRef<HTMLButtonElement>(null);
  const [cam, setCam] = useState<'starting' | 'on' | 'off'>('starting');
  const [count, setCount] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const taking = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let done = false;
    const giveUp = window.setTimeout(() => { if (!done) { done = true; setCam('off'); } }, CAMERA_WAIT_MS);
    if (!navigator.mediaDevices?.getUserMedia) { done = true; setCam('off'); }
    else {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
        .then((s) => {
          if (done) { s.getTracks().forEach((t) => t.stop()); return; }
          done = true;
          stream = s;
          if (videoRef.current) { videoRef.current.srcObject = s; void videoRef.current.play().catch(() => {}); }
          setCam('on');
        })
        .catch(() => { if (!done) { done = true; setCam('off'); } });
    }
    return () => { done = true; window.clearTimeout(giveUp); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  useEffect(() => { shutterRef.current?.focus({ preventScroll: true }); }, []);

  const shoot = useCallback(async () => {
    if (taking.current) return;
    taking.current = true;
    setCount(null);
    shutterClick();
    flash();
    let file: File | null = null;
    const v = videoRef.current;
    if (cam === 'on' && v && v.videoWidth > 0) {
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const g = c.getContext('2d');
      if (g) {
        g.translate(c.width, 0);
        g.scale(-1, 1);
        g.drawImage(v, 0, 0);
        const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.88));
        if (blob) file = new File([blob], 'together.jpg', { type: 'image/jpeg' });
      }
    }
    file ??= await samplePhoto(quest);
    if (file) onTake(file);
    else { taking.current = false; setFailed(true); }
  }, [cam, quest, onTake]);

  // Once we know whether there's a camera, count 3-2-1 and take it.
  useEffect(() => { if (cam !== 'starting') setCount(COUNT_FROM); }, [cam]);
  useEffect(() => {
    if (count === null) return;
    if (count === 0) { void shoot(); return; }
    const t = window.setTimeout(() => setCount((c) => (c == null ? null : c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [count, shoot]);

  const poster = quest.posterUrl ?? '/seed/groups/boba-and-sketch.webp';
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Camera" data-testid="arrival-camera"
      className="fixed inset-0 z-[100] animate-veil overflow-hidden bg-[#080809] text-white">
      <video ref={videoRef} muted playsInline className={cn('absolute inset-0 size-full object-cover [transform:scaleX(-1)]', cam !== 'on' && 'hidden')} />
      {cam !== 'on' && (
        // eslint-disable-next-line @next/next/no-img-element -- the plan's photo stands in for the camera
        <img src={poster} alt="" className="absolute inset-0 size-full scale-[1.04] object-cover" />
      )}
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(8,8,9,0)_55%,rgba(8,8,9,0.55)_100%)]" />
      <div aria-hidden className="absolute inset-[9%_7%_22%]">
        <span className="absolute inset-y-0 left-1/3 w-px bg-white/25" />
        <span className="absolute inset-y-0 left-2/3 w-px bg-white/25" />
        <span className="absolute inset-x-0 top-1/3 h-px bg-white/25" />
        <span className="absolute inset-x-0 top-2/3 h-px bg-white/25" />
        <span className="absolute left-0 top-0 size-12 border-l-4 border-t-4 border-white/90" />
        <span className="absolute right-0 top-0 size-12 border-r-4 border-t-4 border-white/90" />
        <span className="absolute bottom-0 left-0 size-12 border-b-4 border-l-4 border-white/90" />
        <span className="absolute bottom-0 right-0 size-12 border-b-4 border-r-4 border-white/90" />
      </div>

      <div className="absolute inset-x-4 top-4 flex items-center justify-between md:inset-x-8 md:top-6">
        <button type="button" aria-label="Close the camera" onClick={onCancel} className="flex size-12 items-center justify-center rounded-full hover:bg-white/10">
          <X size={28} aria-hidden />
        </button>
        <span className="truncate px-2 text-[17px] font-bold [text-shadow:0_2px_8px_rgba(8,8,9,0.5)]">{quest.title}</span>
        <span className="size-12" />
      </div>

      <div className="absolute inset-x-0 top-[34%] flex -translate-y-1/2 flex-col items-center gap-3">
        {count !== null && count > 0 && (
          <span key={count} aria-live="assertive" className="animate-count text-[180px] font-black leading-none tracking-[-0.05em] [text-shadow:0_8px_40px_rgba(8,8,9,0.45)] md:text-[220px]">
            {count}
          </span>
        )}
        {cam === 'starting' && <span className="text-[16px] font-semibold text-white/85">Opening the camera…</span>}
        {failed && <span role="alert" className="text-[16px] font-semibold">Couldn’t take the photo. Tap the shutter to try again.</span>}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex h-[150px] flex-col items-center justify-center gap-2 bg-[#080809]/75">
        <button ref={shutterRef} type="button" data-testid="together-shutter" aria-label="Take the photo now" onClick={() => void shoot()}
          className="oh-press size-[88px] rounded-full border-[5px] border-white p-[6px]">
          <span className="block size-full rounded-full bg-white" />
        </button>
        {cam === 'off' && <span className="text-[13px] font-semibold text-white/70">No camera here, so this uses the plan’s photo</span>}
      </div>
    </div>,
    document.body,
  );
}

// ---- C. The photo lands ----

function PrintView({ quest, file, people, onDone }: { quest: Quest; file: File; people: ArrivalPerson[]; onDone: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [caption, setCaption] = useState<'pending' | 'none' | string>('pending');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rateLater, setRateLater] = useState(false);
  const [takenAt] = useState(() => new Date().toISOString());
  const rootRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const save = useCallback(async () => {
    setError(null);
    setCaption('pending');
    try {
      // Save first (saving marks the plan done once it has started), then ask Muse for a caption from the
      // plan (live in about 7 s in rehearsal). If that fails (for example 409 while the plan is still active),
      // ask Muse Vision to caption the saved photo instead.
      const m = await saveToAlbum(quest.id, file);
      const ask = (b: Record<string, unknown>) => apiPost<{ caption: string | null }>('/api/muse/caption', b)
        .then((r) => r.caption?.trim() ?? '').catch(() => '');
      const cap = (await ask({ questId: quest.id })) || (await ask({ memoryId: m.id, consent: true }));
      if (cap) {
        await apiFetch<unknown>(`/api/memories/${m.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ caption: cap }),
        }).catch(() => {});
      }
      setMemory(m);
      setCaption(cap || 'none');
    } catch (e) {
      setCaption('none');
      setError(e instanceof Error ? e.message : 'Couldn’t save the photo. Try again.');
    }
  }, [quest.id, file]);
  useEffect(() => { if (!started.current) { started.current = true; void save(); } }, [save]);
  useEffect(() => { if (memory) doneRef.current?.focus({ preventScroll: true }); }, [memory]);

  // Muse's caption types itself out. Paced by the clock, not by ticks, so a busy 3D page can slow
  // the frames but never stall the sentence halfway.
  useEffect(() => {
    if (caption === 'pending' || caption === 'none') { setTyped(''); return; }
    if (reducedMotion()) { setTyped(caption); return; }
    const t0 = performance.now();
    let raf = 0;
    const step = () => {
      const n = Math.min(caption.length, Math.ceil((performance.now() - t0) / 28));
      setTyped(caption.slice(0, n));
      if (n < caption.length) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const finish = window.setTimeout(() => setTyped(caption), caption.length * 28 + 400);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(finish); };
  }, [caption]);

  const others = people.filter((p) => p.here && !p.you).map((p) => first(p.name));

  // Done: the print flies up into Memories (or the top corner), then folds into the capsule.
  const done = () => {
    const el = printRef.current;
    const link = Array.from(document.querySelectorAll<HTMLElement>('a[href="/memories"]')).find((a) => a.getBoundingClientRect().width > 0) ?? null;
    if (!el || reducedMotion()) { onDone(); return; }
    const r = el.getBoundingClientRect();
    const t = link?.getBoundingClientRect() ?? { left: window.innerWidth - 72, top: 12, width: 40, height: 40 };
    const dx = t.left + t.width / 2 - (r.left + r.width / 2);
    const dy = t.top + t.height / 2 - (r.top + r.height / 2);
    rootRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 560, easing: 'ease-in', fill: 'forwards' });
    const a = el.animate(
      [{ transform: 'rotate(-2.5deg)' }, { transform: `translate(${dx}px, ${dy}px) rotate(10deg) scale(0.06)`, opacity: 0.7 }],
      { duration: 560, easing: EASE.in, fill: 'forwards' },
    );
    a.onfinish = () => { if (link) bump(link, '', 1.25); onDone(); };
  };

  const rate = () => {
    if (!memory) return;
    if (requestRating({ questId: quest.id, crewId: memory.crewId, photoIds: [memory.id] })) onDone();
    else setRateLater(true);
  };

  return createPortal(
    <div ref={rootRef} role="dialog" aria-modal="true" aria-label="Your photo" data-testid="arrival-saved"
      className="fixed inset-0 z-[100] flex animate-veil flex-col items-center justify-center gap-6 overflow-hidden bg-[#1C1D1F] px-4 py-6">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- local preview of the photo just taken
        <img src={url} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover blur-[28px] brightness-[0.45]" />
      )}

      <div ref={printRef} className="relative w-[min(86vw,500px)] rotate-[-2.5deg]">
        <figure className="animate-polaroid bg-white p-3 pb-5 shadow-[0_30px_70px_rgba(0,0,0,0.45)] md:p-[18px] md:pb-6">
          {url && (
            // eslint-disable-next-line @next/next/no-img-element -- local preview of the photo just taken
            <img src={url} alt={`Your photo from ${quest.title}`} className="block aspect-[6/5] max-h-[46vh] w-full bg-[#E4E6EB] object-cover" />
          )}
          <figcaption className="flex flex-col gap-1.5 px-1 pt-4">
            {caption !== 'none' && (
              <span className="flex items-center gap-1.5 text-[13px] font-extrabold text-fb-blue">
                <Sparkles size={14} aria-hidden />{caption === 'pending' ? 'Muse is looking at your photo…' : 'Muse wrote'}
              </span>
            )}
            {caption !== 'none' && caption !== 'pending' && (
              <p data-testid="arrival-caption" aria-label={caption} className="min-h-[52px] text-[19px] font-bold leading-snug tracking-[-0.01em] text-fb-text md:text-[22px]">
                <span aria-hidden>{typed}</span>
              </p>
            )}
            <span className="text-[14px] font-semibold text-fb-text-2">{quest.venueName}, {formatDemoTime(takenAt)}</span>
          </figcaption>
        </figure>
      </div>

      <div className="relative flex flex-col items-center gap-4 text-center">
        <p role="status" className="flex items-center gap-2 text-[17px] font-bold text-white">
          {error ? error : memory ? (
            <><Check size={22} strokeWidth={3} aria-hidden className="text-[#7BE0A2]" />Saved to your memories{others.length ? ` with ${names(others)}` : ''}</>
          ) : 'Saving to your memories…'}
        </p>
        {rateLater && <p className="text-[14px] text-white/80">You can rate it from Memories once the hangout ends.</p>}
        <div className="flex flex-wrap justify-center gap-3">
          {error ? (
            <button type="button" onClick={() => void save()} className="h-12 rounded-[10px] bg-white px-8 text-[16px] font-extrabold text-fb-text">Try again</button>
          ) : (
            <>
              <button type="button" data-testid="arrival-rate" disabled={!memory} onClick={rate}
                className="h-12 rounded-[10px] border-2 border-white/70 px-6 text-[16px] font-bold text-white hover:bg-white/10 disabled:opacity-40">
                Rate the hangout
              </button>
              <button ref={doneRef} type="button" data-testid="arrival-done" disabled={!memory} onClick={done}
                className="oh-press h-12 rounded-[10px] bg-white px-9 text-[16px] font-extrabold text-fb-text disabled:opacity-40">
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
