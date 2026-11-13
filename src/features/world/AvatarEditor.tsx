'use client';
// "My character": the viewer dresses their little 3D character. Every tap applies live to the
// character in the street behind the sheet and is saved for this persona in this browser.
import { RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn, sfx } from '@/features/ui';
import {
  ACCESSORIES, BOTTOM_COLORS, HAIR_COLORS, HAIR_STYLES, SKIN, TOP_COLORS, TOPS,
  currentLook, defaultLook, saveLook, type AvatarLook,
} from './avatarLook';

const LABEL: Record<string, string> = {
  short: 'Short', buzz: 'Buzz', curly: 'Curly', long: 'Long', bun: 'Bun', ponytail: 'Ponytail',
  tee: 'Tee', hoodie: 'Hoodie', jacket: 'Jacket',
  none: 'None', glasses: 'Glasses', cap: 'Cap', beanie: 'Beanie', headphones: 'Headphones',
};

export function AvatarEditor({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(document.querySelector<HTMLElement>('[data-testid="out-here-map"]') ?? document.body); }, []);
  const [look, setLook] = useState<AvatarLook>(() => currentLook(userId));
  const set = <K extends keyof AvatarLook>(k: K, v: AvatarLook[K]) => {
    const next = { ...look, [k]: v };
    setLook(next);
    saveLook(userId, next);
    sfx('pop_stamp');
  };
  if (!host) return null;

  const Swatches = ({ k, colors }: { k: 'skin' | 'hairColor' | 'topColor' | 'bottomColor'; colors: readonly string[] }) => (
    <div className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button key={c} type="button" aria-label={c} aria-pressed={look[k] === c} onClick={() => set(k, c)}
          className={cn('size-8 rounded-full ring-offset-2 transition-transform hover:scale-110', look[k] === c ? 'ring-[3px] ring-fb-blue' : 'ring-1 ring-black/10')}
          style={{ background: c }} />
      ))}
    </div>
  );
  const Chips = <K extends 'hair' | 'top' | 'accessory'>({ k, options }: { k: K; options: readonly AvatarLook[K][] }) => (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={look[k] === o} onClick={() => set(k, o)}
          className={cn('h-8 rounded-full px-3 text-[13px] font-semibold', look[k] === o ? 'bg-fb-blue text-white' : 'bg-fb-secondary-btn text-fb-text hover:brightness-95')}>
          {LABEL[o] ?? o}
        </button>
      ))}
    </div>
  );
  const Row = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div><p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-fb-text-2">{title}</p>{children}</div>
  );

  return createPortal(
    <section aria-label="My character" data-testid="avatar-editor"
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 flex max-h-[58%] animate-sheet-up flex-col rounded-t-[24px] bg-fb-surface shadow-popover md:bottom-4 md:left-4 md:right-auto md:max-h-[80%] md:w-[380px] md:rounded-[24px]">
      <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-3">
        <div>
          <h2 className="text-[18px] font-bold text-fb-text">My character</h2>
          <p className="text-[12px] text-fb-text-2">Changes show on you in the street right away.</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Reset to my default look" title="Reset" onClick={() => { const d = defaultLook(userId); setLook(d); saveLook(userId, d); }}
            className="flex size-9 items-center justify-center rounded-full text-fb-text-2 hover:bg-fb-hover"><RotateCcw size={17} aria-hidden /></button>
          <button type="button" aria-label="Done" onClick={onClose} data-testid="avatar-editor-done"
            className="flex size-9 items-center justify-center rounded-full bg-fb-secondary-btn text-fb-text hover:brightness-95"><X size={18} aria-hidden /></button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        <Row title="Skin"><Swatches k="skin" colors={SKIN} /></Row>
        <Row title="Hair"><Chips k="hair" options={HAIR_STYLES} /></Row>
        <Row title="Hair color"><Swatches k="hairColor" colors={HAIR_COLORS} /></Row>
        <Row title="Top"><Chips k="top" options={TOPS} /></Row>
        <Row title="Top color"><Swatches k="topColor" colors={TOP_COLORS} /></Row>
        <Row title="Pants"><Swatches k="bottomColor" colors={BOTTOM_COLORS} /></Row>
        <Row title="Extra"><Chips k="accessory" options={ACCESSORIES} /></Row>
      </div>
    </section>,
    host,
  );
}
