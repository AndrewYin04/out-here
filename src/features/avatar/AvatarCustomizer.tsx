'use client';

// "Edit avatar": pick a body and a colour for skin, hair, top, bottoms and shoes, with a live
// full-body preview. Each row is a radio group (arrow keys move between swatches).
import { useState, type KeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import { Button, cn, Modal } from '@/features/ui';
import { AREAS, BODIES, PALETTES, type AreaName, type AvatarLook } from './looks';
import { LookFigure } from './LookAvatar';
import { resetLook, saveLook, useLook } from './useAvatar';

export function AvatarCustomizer({ personId, open, onClose }: { personId: string; open: boolean; onClose: () => void }) {
  const current = useLook(personId);
  return (
    <Modal open={open} onClose={onClose} title="Edit avatar" size="lg">
      {/* Remount per open so a cancelled edit never lingers. */}
      {open && <Editor key={JSON.stringify(current)} personId={personId} initial={current} onClose={onClose} />}
    </Modal>
  );
}

function Editor({ personId, initial, onClose }: { personId: string; initial: AvatarLook; onClose: () => void }) {
  const [look, setLook] = useState<AvatarLook>(initial);
  const set = <K extends keyof AvatarLook>(k: K, v: AvatarLook[K]) => setLook((l) => ({ ...l, [k]: v }));

  return (
    <div className="flex flex-col gap-4 md:flex-row" data-testid="avatar-customizer">
      <div className="flex shrink-0 justify-center rounded-card bg-[#EEF3FA] p-3 md:w-[220px]">
        <LookFigure look={look} label="Preview of your avatar" className="h-[300px] md:h-[380px]" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <fieldset>
          <legend className="mb-1.5 text-[15px] font-semibold text-fb-text">Body</legend>
          <div className="flex gap-2" role="radiogroup" aria-label="Body">
            {BODIES.map((b) => (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={look.body === b.id}
                onClick={() => set('body', b.id)}
                className={cn(
                  'h-9 flex-1 rounded-btn border text-[15px] font-semibold',
                  look.body === b.id ? 'border-fb-blue bg-fb-blue-tint text-fb-blue' : 'border-fb-divider text-fb-text hover:bg-fb-hover',
                )}
                data-testid={`avatar-body-${b.id}`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </fieldset>
        {AREAS.map((a) => <SwatchRow key={a.id} area={a.id} label={a.label} value={look[a.id]} onChange={(v) => set(a.id, v)} />)}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Button onClick={() => { saveLook(personId, look); onClose(); }} data-testid="avatar-save">Save</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <span className="flex-1" />
          <Button variant="ghost" onClick={() => { resetLook(personId); onClose(); }}>Reset to default</Button>
        </div>
        <p className="text-[12px] text-fb-text-2">Demo: your look is saved in this browser.</p>
      </div>
    </div>
  );
}

function SwatchRow({ area, label, value, onChange }: { area: AreaName; label: string; value: string; onChange: (v: string) => void }) {
  const swatches = PALETTES[area];
  const index = Math.max(0, swatches.findIndex((s) => s.id === value));
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = swatches[(index + step + swatches.length) % swatches.length];
    onChange(next.id);
    (e.currentTarget.parentElement?.querySelector(`[data-swatch="${next.id}"]`) as HTMLButtonElement | null)?.focus();
  };
  return (
    <fieldset>
      <legend className="mb-1.5 text-[15px] font-semibold text-fb-text">
        {label} <span className="font-normal text-fb-text-2">· {swatches[index].label}</span>
      </legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {swatches.map((s) => {
          const on = s.id === value;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={s.label}
              title={s.label}
              tabIndex={on ? 0 : -1}
              data-swatch={s.id}
              data-testid={`avatar-${area}-${s.id}`}
              onClick={() => onChange(s.id)}
              onKeyDown={onKey}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full border shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fb-blue',
                on ? 'border-fb-blue ring-2 ring-fb-blue ring-offset-2' : 'border-black/10',
              )}
              style={{ backgroundColor: s.hex }}
            >
              {on && <Check size={16} aria-hidden className={s.hex > '#B0' ? 'text-black/70' : 'text-white'} />}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
