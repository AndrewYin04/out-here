'use client';
// The group selfie, reviewed before it's saved (Alan's reference): the shot, who's in it, Muse's
// caption typing in, quick reactions, Save. Face boxes are drawn only when the browser can really
// find faces (the Shape Detection API); otherwise the tags are the people who arrived, and the
// chip says so ("Muse tagged who's here"), so nothing on screen claims more than it did.
import { RotateCcw, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/features/ui';
import type { Face } from './SelfieCamera';

type Box = { x: number; y: number; w: number; h: number };
type Detector = { detect: (img: ImageBitmapSource) => Promise<{ boundingBox: DOMRectReadOnly }[]> };
const REACTIONS = ['😋', '🔥', '🥟', '❤️'] as const;
const first = (n: string) => n.split(' ')[0] ?? n;

export function SelfieReview({ file, people, viewerId, caption, emoji, saving, onRetake, onSave }: {
  file: File;
  /** Everyone who arrived (you first). */
  people: Face[];
  viewerId: string;
  /** Muse's caption; types in as it arrives. */
  caption: string;
  emoji: string;
  saving: boolean;
  onRetake: () => void;
  onSave: (caption: string, reactions: string[]) => void;
}) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const imgRef = useRef<HTMLImageElement>(null);
  const [boxes, setBoxes] = useState<Box[] | null>(null);
  const [text, setText] = useState('');
  const [edited, setEdited] = useState(false);
  const [mine, setMine] = useState<string[]>([]);
  const ordered = useMemo(() => [...people].sort((a, b) => Number(b.id === viewerId) - Number(a.id === viewerId)), [people, viewerId]);
  const reactionPool = useMemo(() => [...REACTIONS.slice(0, 2), emoji, '❤️'].filter((e, i, a) => a.indexOf(e) === i), [emoji]);

  // Real face detection where the browser has it; boxes in % of the image.
  const detect = async () => {
    const FD = (window as unknown as { FaceDetector?: new (o: object) => Detector }).FaceDetector;
    const img = imgRef.current;
    if (!FD || !img) return;
    try {
      const found = await new FD({ fastMode: true, maxDetectedFaces: 8 }).detect(img);
      const W = img.naturalWidth || 1, H = img.naturalHeight || 1;
      setBoxes(found.map(({ boundingBox: b }) => ({ x: (b.x / W) * 100, y: (b.y / H) * 100, w: (b.width / W) * 100, h: (b.height / H) * 100 }))
        .sort((a, b) => a.x - b.x));
    } catch { /* no detector: tags only */ }
  };

  // Muse's caption types in, unless you've started editing.
  useEffect(() => {
    if (edited || !caption) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 2;
      setText(caption.slice(0, i));
      if (i >= caption.length) window.clearInterval(id);
    }, 28);
    return () => window.clearInterval(id);
  }, [caption, edited]);

  const inShot = boxes && boxes.length > 0 ? boxes.length : ordered.length;
  const label = (p: Face) => (p.id === viewerId ? 'You' : first(p.name));

  return (
    <div className="space-y-3" data-testid="selfie-review">
      <div className="relative overflow-hidden rounded-[22px] bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the shot */}
        <img ref={imgRef} src={url} alt="Your group selfie" onLoad={() => void detect()} className="aspect-[4/3] w-full animate-polaroid object-cover" />
        {boxes?.map((b, i) => {
          const p = ordered[i];
          return (
            <div key={i} className="absolute animate-pop-in rounded-[12px] border-[2.5px] border-[#31E07A] shadow-[0_0_0_1px_rgba(0,0,0,.15)]"
              style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`, animationDelay: `${150 + i * 120}ms` }}>
              {p && <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#31A24C] px-2 py-0.5 text-[12px] font-bold text-white">{label(p)} ✓</span>}
            </div>
          );
        })}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-semibold text-white backdrop-blur">
          <Sparkles size={13} aria-hidden className="text-[#B9A6FF]" />{boxes && boxes.length > 0 ? 'Muse vision' : 'Muse tagged who’s here'}
        </span>
        <span data-testid="selfie-in-shot" className="absolute right-3 top-3 rounded-full bg-[#31A24C] px-2.5 py-1 text-[12px] font-bold text-white">{inShot} in shot</span>
        <button type="button" onClick={onRetake} className="absolute bottom-3 right-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-black/50 px-3 text-[13px] font-semibold text-white backdrop-blur hover:bg-black/65">
          <RotateCcw size={14} aria-hidden />Retake
        </button>
      </div>

      <ul className="flex flex-wrap items-center gap-1.5" aria-label="In the photo">
        {ordered.map((p, i) => (
          <li key={p.id} style={{ animationDelay: `${200 + i * 110}ms` }}
            className="inline-flex animate-pop-in items-center gap-1 rounded-full bg-[#E6F4EA] px-2.5 py-1 text-[13px] font-semibold text-[#1E7B34]">
            {label(p)} <span aria-hidden>✓</span>
          </li>
        ))}
        <li className="text-[13px] font-semibold text-fb-text-2">· {ordered.length} together</li>
      </ul>

      <label className="block rounded-[16px] bg-fb-input px-3 py-2.5">
        <span className="flex items-center gap-1 text-[12px] font-semibold text-[#6B4BFF]"><Sparkles size={13} aria-hidden />Muse caption</span>
        <input data-testid="selfie-caption" value={text} maxLength={200} placeholder={caption ? '' : 'Muse is writing…'}
          onChange={(e) => { setEdited(true); setText(e.target.value); }}
          className="mt-0.5 w-full bg-transparent text-[16px] font-semibold text-fb-text outline-none" />
      </label>

      <div className="flex items-center gap-2">
        {reactionPool.map((e) => {
          const on = mine.includes(e);
          return (
            <button key={e} type="button" aria-pressed={on} aria-label={`React ${e}`}
              onClick={() => setMine((m) => (on ? m.filter((x) => x !== e) : [...m, e]))}
              className={cn('oh-press flex h-10 items-center gap-1 rounded-full px-3 text-[20px] transition-all', on ? 'scale-105 bg-fb-blue-tint ring-2 ring-fb-blue' : 'bg-fb-input')}>
              {e}{on && <span className="text-[13px] font-bold text-fb-blue">1</span>}
            </button>
          );
        })}
        <button type="button" data-testid="selfie-save" disabled={saving} onClick={() => onSave(text.trim() || caption, mine)}
          className="oh-press ml-auto h-11 rounded-[14px] bg-fb-blue px-6 text-[16px] font-semibold text-white hover:bg-fb-blue-hover disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
