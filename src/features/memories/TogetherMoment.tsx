'use client';
// You all made it (#47, Alan's "get together" reference). When you reach a plan you joined, this
// sheet takes over the bottom of the 3D view and walks the group through one moment:
//   You made it 🎉 (who's here, who's a minute out) → Group selfie (front camera, everyone who's
//   here around the shutter) → the photo, tagged, with a Muse caption → Saved to the crew, then
//   "How was it?" (private, it feeds the next match).
// Uses the same endpoints as MemoryCapture: complete → crew album, POST /api/memories, /api/muse/caption.
import { Camera, ImagePlus, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, apiPost, useApi, type QuestDetail } from '@/features/data';
import { Avatar, burst, cn, flash } from '@/features/ui';
import type { CompleteQuestResponse, Memory, Quest } from '@/shared';
import type { PersonCard } from '@/shared/api';
import { arrivalWait, emitMemorySaved, requestRating } from './arrival';

type Walker = { id: string; name: string; avatarUrl: string; minutesAway: number };
type Stage = 'arrived' | 'camera' | 'review' | 'saving' | 'saved';
type Person = { id: string; name: string; avatarUrl: string; here: boolean; minutes: number | null; you: boolean };

const first = (n: string) => n.split(' ')[0] ?? n;
const FEELINGS = [
  { key: 'loved', emoji: '😍', label: 'Loved it' },
  { key: 'good', emoji: '🙂', label: 'Good' },
  { key: 'meh', emoji: '😐', label: 'Not for me' },
] as const;

/** A sample photo for the stage (or a laptop without a camera): the plan's own seed photo. */
async function samplePhoto(quest: Quest): Promise<File | null> {
  const src = quest.posterUrl ?? '/seed/groups/boba-and-sketch.webp';
  try {
    const blob = await fetch(src).then((r) => (r.ok ? r.blob() : Promise.reject()));
    return new File([blob], 'together.webp', { type: blob.type || 'image/webp' });
  } catch { return null; }
}

export function TogetherMoment({ quest, viewer, walkers, onClose }: {
  quest: Quest | null;
  viewer: { id: string; name: string; avatarUrl?: string };
  /** People walking to this plan, with minutes left (from the walk-together share). */
  walkers: Walker[];
  onClose: () => void;
}) {
  if (!quest) return null;
  return <Moment key={quest.id} quest={quest} viewer={viewer} walkers={walkers} onClose={onClose} />;
}

function Moment({ quest, viewer, walkers, onClose }: {
  quest: Quest; viewer: { id: string; name: string; avatarUrl?: string }; walkers: Walker[]; onClose: () => void;
}) {
  const detail = useApi<QuestDetail>(`/api/quests/${quest.id}`, [`quest:${quest.id}`]);
  const [stage, setStage] = useState<Stage>('arrived');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [typed, setTyped] = useState('');
  const [reactions, setReactions] = useState<Record<string, number>>({ '😋': 2 });
  const [saved, setSaved] = useState<Memory | null>(null);
  const [feeling, setFeeling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flying, setFlying] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const early = arrivalWait(quest.startsAt, Date.now()).early;

  // Who's here: you, plus everyone going whose walk says they're within a minute.
  const people: Person[] = useMemo(() => {
    const members: PersonCard[] = detail.data?.members ?? [];
    const byId = new Map(walkers.map((w) => [w.id, w]));
    const list = members.map((m) => {
      const w = byId.get(m.id);
      const you = m.id === viewer.id;
      return { id: m.id, name: m.name, avatarUrl: m.avatarUrl, you, here: you || (!!w && w.minutesAway <= 1), minutes: w ? w.minutesAway : null };
    });
    if (!list.some((p) => p.you)) list.unshift({ id: viewer.id, name: viewer.name, avatarUrl: viewer.avatarUrl ?? '', you: true, here: true, minutes: 0 });
    return list.sort((a, b) => Number(b.here) - Number(a.here) || Number(b.you) - Number(a.you));
  }, [detail.data, walkers, viewer]);
  const here = people.filter((p) => p.here);

  // Confetti when you arrive, and again each time someone else gets there.
  const lastCount = useRef(0);
  useEffect(() => {
    if (here.length > lastCount.current) burst(sheetRef.current, [quest.emoji, '🎉', '✨', '🎊'], lastCount.current === 0 ? 24 : 14);
    lastCount.current = here.length;
  }, [here.length, quest.emoji]);

  useEffect(() => {
    if (!photo) { setPreview(null); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  // The Muse caption types itself in once the photo is taken.
  useEffect(() => {
    if (stage !== 'review' || caption) return;
    let cancelled = false;
    apiPost<{ caption: string }>('/api/muse/caption', { questId: quest.id })
      .then((r) => { if (!cancelled) setCaption(r.caption); })
      .catch(() => { if (!cancelled) setCaption(`${quest.title} ${quest.emoji}`); });
    return () => { cancelled = true; };
  }, [stage, caption, quest.id, quest.title, quest.emoji]);
  useEffect(() => {
    if (!caption) return;
    let i = 0;
    const t = window.setInterval(() => { i += 1; setTyped(caption.slice(0, i)); if (i >= caption.length) window.clearInterval(t); }, 28);
    return () => window.clearInterval(t);
  }, [caption]);

  const took = useCallback((file: File) => {
    flash();
    setPhoto(file);
    setStage('review');
  }, []);

  const save = async () => {
    if (!photo) return;
    setStage('saving');
    setError(null);
    try {
      const crewId = (await apiPost<CompleteQuestResponse>(`/api/quests/${quest.id}/complete`, {})).crew.id;
      const form = new FormData();
      form.set('photo', photo, photo.name || 'together.jpg');
      form.set('questId', quest.id);
      form.set('crewId', crewId);
      form.set('caption', typed || caption);
      const { memory } = await apiFetch<{ memory: Memory }>('/api/memories', { method: 'POST', body: form });
      emitMemorySaved({ questId: quest.id, crewId, memoryId: memory.id });
      setSaved(memory);
      setFlying(true);
      window.setTimeout(() => { setFlying(false); setStage('saved'); }, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save the photo. Try again.');
      setStage('review');
    }
  };

  const feel = (key: string, el: HTMLElement) => {
    setFeeling(key);
    burst(el, key === 'loved' ? ['😍', '💛', '✨'] : ['✨'], key === 'loved' ? 16 : 8);
    // The full private rating (#18) opens if it's on the page; otherwise this tap is enough.
    window.setTimeout(() => {
      if (saved && requestRating({ questId: quest.id, crewId: saved.crewId, photoIds: [saved.id] })) onClose();
    }, 1100);
  };

  const groupName = detail.data?.group?.name ?? 'your crew';
  return (
    <section ref={sheetRef} aria-label="You made it" data-testid="together-moment" data-stage={stage}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex max-h-[86%] animate-sheet-up flex-col rounded-t-[24px] bg-fb-surface shadow-popover md:bottom-4 md:left-1/2 md:w-[460px] md:-translate-x-1/2 md:rounded-[24px]">
      <div className="relative flex h-8 shrink-0 items-center justify-center">
        <span className="h-1 w-10 rounded-full bg-fb-divider" aria-hidden />
        <button type="button" aria-label="Close" onClick={onClose} className="absolute right-2 top-1 flex size-8 items-center justify-center rounded-full text-fb-text-2 hover:bg-fb-hover">
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="min-h-0 overflow-y-auto px-4 pb-4">
        {stage === 'arrived' && (
          <div className="flex items-center gap-3 animate-step-in">
            <div className="min-w-0 flex-1">
              <h2 className="text-[22px] font-extrabold text-fb-text">{here.length > 1 ? 'You made it!' : 'You’re here!'} <span aria-hidden>🎉</span></h2>
              <ul className="mt-2 flex gap-3 overflow-x-auto pb-1" aria-label="Who's here">
                {people.map((p) => (
                  <li key={p.id} className="flex w-12 shrink-0 flex-col items-center gap-0.5">
                    <span className="relative">
                      <Avatar src={p.avatarUrl} name={p.name} size={48} decorative className={cn('transition-all', p.here ? 'ring-[3px] ring-[#31A24C]' : 'opacity-50 grayscale')} />
                      {p.here ? (
                        <span aria-hidden className="absolute -right-0.5 -top-0.5 flex size-5 animate-pop-in items-center justify-center rounded-full bg-[#31A24C] text-[11px] font-bold text-white ring-2 ring-white">✓</span>
                      ) : p.minutes != null ? (
                        <span className="absolute -right-1 -top-1 rounded-full bg-fb-surface px-1 text-[10px] font-bold text-fb-text-2 shadow">{Math.max(1, p.minutes)}m</span>
                      ) : null}
                    </span>
                    <span className="w-full truncate text-center text-[11px] font-semibold text-fb-text">{p.you ? 'You' : first(p.name)}</span>
                    <span className="sr-only">{p.here ? 'is here' : p.minutes != null ? `${p.minutes} min away` : 'on the way'}</span>
                  </li>
                ))}
              </ul>
              {early && <p className="text-[13px] text-fb-text-2">You’re early. The photo opens closer to the start.</p>}
            </div>
            <button type="button" data-testid="together-selfie" disabled={early} onClick={() => setStage('camera')}
              className="oh-press flex h-12 shrink-0 items-center gap-1.5 rounded-[14px] bg-fb-blue px-4 text-[16px] font-semibold text-white shadow-[0_6px_16px_rgba(8,102,255,.35)] disabled:opacity-50">
              <Camera size={18} aria-hidden />Selfie
            </button>
          </div>
        )}

        {stage === 'camera' && <SelfieCamera here={here} quest={quest} onTake={took} onPickFile={() => fileRef.current?.click()} />}

        {(stage === 'review' || stage === 'saving') && preview && (
          <div className="animate-step-in">
            <div className="flex items-center justify-between">
              <h2 className="text-[20px] font-extrabold text-fb-text">Group selfie <span aria-hidden>📸</span></h2>
              <span className="rounded-full bg-fb-blue px-2.5 py-0.5 text-[13px] font-semibold text-white">{here.length} in shot</span>
            </div>
            <div className="relative mt-2 overflow-hidden rounded-[18px]">
              {/* eslint-disable-next-line @next/next/no-img-element -- the photo just taken */}
              <img src={preview} alt="Your group selfie" className="max-h-[260px] w-full animate-polaroid object-cover" />
              <span className="absolute bottom-2 right-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-[#6B4BFF]">✨ Muse vision</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {here.map((p, i) => (
                <span key={p.id} className="inline-flex animate-pop-in items-center gap-1 rounded-full bg-[#E6F4EA] py-0.5 pl-0.5 pr-2 text-[13px] font-semibold text-fb-green" style={{ animationDelay: `${150 + i * 120}ms` }}>
                  <Avatar src={p.avatarUrl} name={p.name} size={20} decorative />{p.you ? 'You' : first(p.name)} ✓
                </span>
              ))}
              {here.length > 1 && <span className="rounded-full bg-fb-blue px-2.5 py-0.5 text-[13px] font-semibold text-white">{here.length} together</span>}
            </div>
            <label className="mt-2 block rounded-[14px] bg-fb-input px-3 py-2">
              <span className="block text-[11px] font-semibold text-[#6B4BFF]">✨ Muse caption</span>
              <input value={typed} maxLength={200} onChange={(e) => { setCaption(e.target.value); setTyped(e.target.value); }} placeholder="Say something about it"
                className="w-full bg-transparent text-[15px] font-semibold text-fb-text outline-none" />
            </label>
            <div className="mt-2 flex items-center gap-2">
              {['😋', '🔥', quest.emoji].map((r) => (
                <button key={r} type="button" onClick={() => setReactions((s) => ({ ...s, [r]: (s[r] ?? 0) + 1 }))}
                  className="oh-press inline-flex h-9 items-center gap-1 rounded-full bg-fb-input px-3 text-[16px]">
                  {r}{reactions[r] ? <span className="text-[13px] font-semibold text-fb-text">{reactions[r]}</span> : null}
                </button>
              ))}
              <button type="button" data-testid="together-save" disabled={stage === 'saving'} onClick={() => void save()}
                className="oh-press ml-auto h-10 rounded-[12px] bg-fb-blue px-5 text-[15px] font-semibold text-white disabled:opacity-60">
                {stage === 'saving' ? 'Saving…' : 'Save'}
              </button>
            </div>
            {error && <p role="alert" className="mt-2 text-[13px] text-fb-red">{error}</p>}
          </div>
        )}

        {stage === 'saved' && saved && (
          <div className="animate-step-in" data-testid="together-saved">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- the saved photo */}
              <img src={preview ?? saved.photoUrl} alt="" className="size-12 rounded-[12px] object-cover" />
              <div className="min-w-0">
                <p className="text-[17px] font-extrabold text-fb-text">Saved to {groupName} ✓</p>
                <p className="truncate text-[13px] text-fb-text-2">{saved.caption || quest.title}</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-[#FFF1E0] px-2.5 py-0.5 text-[13px] font-semibold text-[#C2410C]">🔥 {here.length} together</span>
              <span className="rounded-full bg-[#EFEBFF] px-2.5 py-0.5 text-[13px] font-semibold text-[#6B4BFF]">✨ Muse remembers this crew</span>
              <span className="rounded-full bg-fb-input px-2.5 py-0.5 text-[13px] font-semibold text-fb-text">📸 +1</span>
            </div>
            <p className="mt-4 text-center text-[14px] font-semibold text-fb-text-2">How was it?</p>
            <div className="mt-2 flex justify-center gap-4">
              {FEELINGS.map((f) => (
                <button key={f.key} type="button" aria-label={f.label} aria-pressed={feeling === f.key} data-testid={`together-feel-${f.key}`}
                  onClick={(e) => feel(f.key, e.currentTarget)}
                  className={cn('oh-press flex size-16 items-center justify-center rounded-full text-[34px] transition-all',
                    feeling === f.key ? 'scale-110 bg-fb-blue-tint ring-[3px] ring-fb-blue' : feeling ? 'bg-fb-input opacity-40' : 'bg-fb-input')}>
                  {f.emoji}
                </button>
              ))}
            </div>
            <p className="mt-2 h-5 text-center text-[14px] font-semibold text-fb-blue">{FEELINGS.find((f) => f.key === feeling)?.label ?? ''}</p>
            <p className="text-center text-[12px] text-fb-text-2">Only Muse sees this. It makes your next plan better.</p>
          </div>
        )}
      </div>

      {/* The saved photo flies up to the plan's pin like a polaroid. */}
      {flying && preview && (
        // eslint-disable-next-line @next/next/no-img-element -- the photo in flight
        <img src={preview} alt="" aria-hidden className="pointer-events-none absolute left-1/2 top-4 z-40 w-40 -translate-x-1/2 rounded-[6px] border-[6px] border-white shadow-popover [animation:oh-fly-up_.9s_cubic-bezier(.5,0,.2,1)_forwards]" />
      )}
      <style>{'@keyframes oh-fly-up{0%{transform:translate(-50%,0) rotate(-3deg) scale(1)}100%{transform:translate(-50%,-420px) rotate(6deg) scale(.25);opacity:.2}}'}</style>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) took(f); e.target.value = ''; }} />
    </section>
  );
}

/** Front camera with everyone who's here around the shutter. Falls back to a sample photo. */
function SelfieCamera({ here, quest, onTake, onPickFile }: {
  here: Person[]; quest: Quest; onTake: (f: File) => void; onPickFile: () => void;
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
