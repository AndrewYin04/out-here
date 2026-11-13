'use client';
// Muse surfaces a listing that matches what the viewer told it they were looking for (card over
// the map), and the Marketplace menu where they tell Muse what they want or sell something.
import { Search, Store, Tag, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiFetchError, apiFetch, apiPost } from '@/features/data';
import { MuseLabel } from '@/features/outhere';
import { Button, cn, useToast } from '@/features/ui';
import type { MuseFind, MuseWantsResponse } from '@/shared/api';
import type { MuseWant } from '@/shared';
import { listingEmoji, money } from './useMarket';

/** "track jacket under $25": the watch a want find matched, as the card and the sheet name it. */
export function watchLabel(w: Pick<MuseWant, 'item' | 'maxPrice'>): string {
  return w.maxPrice !== null ? `${w.item} under ${money(w.maxPrice)}` : w.item;
}

export function MuseFindCard({ find, watch = null, onView, onDismiss }: {
  find: MuseFind;
  /** The watch this find matched ("track jacket under $25"); null for a find from what you watch. */
  watch?: string | null;
  onView: () => void;
  onDismiss: () => void;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => { const id = window.requestAnimationFrame(() => setShown(true)); return () => window.cancelAnimationFrame(id); }, []);
  return (
    <div
      role="status"
      data-testid="muse-find"
      data-source={find.source}
      className={cn(
        'pointer-events-auto w-full max-w-[420px] rounded-card bg-fb-surface p-3 shadow-popover transition-all duration-300 motion-reduce:transition-none',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
      )}
    >
      <div className="flex items-start gap-3">
        {find.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={find.imageUrl} alt="" className="size-14 shrink-0 rounded-card object-cover" />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-card bg-fb-input text-[28px]" aria-hidden>
            {listingEmoji(find.title, '')}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-2">
            {find.source === 'muse' ? <MuseLabel className="shrink-0 py-0" /> : <span className="shrink-0 whitespace-nowrap text-[12px] font-semibold text-fb-blue">✨ Found for you</span>}
            <span className="min-w-0 truncate text-[13px] text-fb-text-2">{find.title} · {money(find.priceUsd)}</span>
          </div>
          {watch && <p data-testid="muse-find-watch" className="mb-0.5 text-[13px] font-semibold leading-4 text-fb-text">Fits the watch you set: {watch}</p>}
          <p data-testid="muse-find-line" className="text-[15px] leading-5 text-fb-text">{find.line}</p>
        </div>
        <button type="button" aria-label="Dismiss" onClick={onDismiss} className="-mr-1 -mt-1 rounded-full p-1 text-fb-text-2 hover:bg-fb-hover">
          <X size={18} aria-hidden />
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <Button data-testid="muse-find-view" size="sm" className="flex-1" onClick={onView}>View</Button>
        <Button size="sm" variant="secondary" onClick={onDismiss}>Not now</Button>
      </div>
    </div>
  );
}

export type MarketMenuProps = {
  wants: MuseWant[];
  onWantsChanged: () => void;
  onSell: () => void;
  showListings: boolean;
  onShowListings: (v: boolean) => void;
};

/** The Marketplace pickup panel: sell, tell Muse what you're looking for, and the map toggle.
 *  Shown inside the Out Here dock's Marketplace tab. */
export function MarketPanel({ wants, onWantsChanged, onSell, showListings, onShowListings }: MarketMenuProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function addWant() {
    if (text.trim().length < 3) return;
    setBusy(true);
    try {
      await apiPost('/api/muse/wants', { text: text.trim() });
      setText('');
      onWantsChanged();
      toast.show('Muse will tell you when something nearby fits.');
    } catch (e) {
      toast.show(e instanceof ApiFetchError ? e.message : 'Muse could not save that. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function removeWant(id: string) {
    try {
      await apiFetch<MuseWantsResponse>(`/api/muse/wants?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      onWantsChanged();
    } catch {
      toast.show('Could not remove that. Try again.');
    }
  }

  const limits = (w: MuseWant) => [w.maxPrice !== null ? `under ${money(w.maxPrice)}` : null, w.maxDriveMin !== null ? `${w.maxDriveMin} min drive` : null].filter(Boolean).join(' · ');

  return (
    <div data-testid="market-menu" className="px-2">
      <Button block icon={<Tag size={16} aria-hidden />} data-testid="market-sell" onClick={onSell}>
        Sell something for pickup
      </Button>
      <p className="mb-1 mt-3 flex items-center gap-1.5 text-[15px] font-semibold text-fb-text"><span aria-hidden>✨</span> Tell Muse what you&apos;re looking for</p>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void addWant(); }}>
        <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-pill bg-fb-input px-3 focus-within:ring-2 focus-within:ring-fb-blue">
          <Search size={16} className="shrink-0 text-fb-text-2" aria-hidden />
          <input
            data-testid="want-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={200}
            placeholder="Desk chair under $40, 15 min drive"
            className="h-9 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fb-text-2"
          />
        </label>
        <Button type="submit" size="sm" disabled={busy || text.trim().length < 3}>{busy ? '…' : 'Save'}</Button>
      </form>
      {wants.length > 0 && (
        <ul data-testid="want-list" className="mt-2 flex flex-col gap-1">
          {wants.map((w) => (
            <li key={w.id} className="flex items-center gap-2 rounded-btn bg-fb-input px-2.5 py-1.5">
              <span className="min-w-0 flex-1 text-[13px] leading-4">
                <span className="block truncate font-semibold capitalize text-fb-text">{w.item}</span>
                {limits(w) && <span className="block text-fb-text-2">{limits(w)}</span>}
              </span>
              <button type="button" aria-label={`Stop looking for ${w.item}`} onClick={() => void removeWant(w.id)} className="rounded-full p-1 text-fb-text-2 hover:bg-fb-hover">
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="mt-3 flex items-center justify-between gap-2 py-1 text-[15px] text-fb-text">
        Show listings on the map
        <input type="checkbox" checked={showListings} onChange={(e) => onShowListings(e.target.checked)} className="size-4 accent-[#0866FF]" />
      </label>
    </div>
  );
}

/** The round Marketplace button in the map's bottom row, and its panel. */
export function MarketMenu({ wants, onWantsChanged, onSell, showListings, onShowListings }: MarketMenuProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // The panel floats above the button in screen space, clamped inside the viewport (the button can
  // sit anywhere in the map's control row, so anchoring to its edge ran the card off screen).
  const [place, setPlace] = useState<{ left: number; bottom: number; width: number; caret: number; maxH: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) { setPlace(null); return; }
    const measure = () => {
      const b = btnRef.current?.getBoundingClientRect();
      if (!b) return;
      const vw = window.innerWidth, vh = window.innerHeight;
      const width = Math.min(360, vw - 24);
      const center = b.left + b.width / 2;
      const left = Math.max(12, Math.min(vw - width - 12, center - width / 2));
      setPlace({ left, bottom: vh - b.top + 12, width, caret: Math.max(20, Math.min(width - 20, center - left)), maxH: Math.max(220, b.top - 76) });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  async function addWant() {
    if (text.trim().length < 3) return;
    setBusy(true);
    try {
      await apiPost('/api/muse/wants', { text: text.trim() });
      setText('');
      onWantsChanged();
      toast.show('Muse will tell you when something nearby fits.');
    } catch (e) {
      toast.show(e instanceof ApiFetchError ? e.message : 'Muse could not save that. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function removeWant(id: string) {
    try {
      await apiFetch<MuseWantsResponse>(`/api/muse/wants?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      onWantsChanged();
    } catch {
      toast.show('Could not remove that. Try again.');
    }
  }

  const limits = (w: MuseWant) => [w.maxPrice !== null ? `under ${money(w.maxPrice)}` : null, w.maxDriveMin !== null ? `${w.maxDriveMin} min drive` : null].filter(Boolean).join(' · ');

  return (
    <div ref={ref} className="relative">
      <button
        ref={btnRef}
        type="button"
        data-testid="market-btn"
        aria-label="Marketplace pickup"
        aria-expanded={open}
        title="Marketplace pickup"
        onClick={() => setOpen((v) => !v)}
        className={cn('flex size-12 items-center justify-center rounded-full shadow-popover', open ? 'bg-fb-blue-tint text-fb-blue' : 'bg-fb-surface text-fb-text hover:bg-fb-hover')}
      >
        <Store size={22} aria-hidden />
      </button>
      {open && place && createPortal(
        <div
          ref={panelRef}
          data-testid="market-menu"
          role="dialog"
          aria-label="Marketplace pickup"
          style={{ left: place.left, bottom: place.bottom, width: place.width, maxHeight: place.maxH }}
          className="fixed z-50 flex origin-bottom animate-pop-in flex-col rounded-[16px] border border-black/[0.06] bg-fb-surface shadow-[0_12px_28px_rgba(0,0,0,0.2),0_2px_4px_rgba(0,0,0,0.1)]"
        >
          {/* A small caret pointing down at the Marketplace button. */}
          <span aria-hidden style={{ left: place.caret }}
            className="absolute -bottom-[7px] size-3.5 -translate-x-1/2 rotate-45 border-b border-r border-black/[0.06] bg-fb-surface" />
          <div className="flex items-center gap-2.5 border-b border-fb-divider-soft px-3 py-2.5">
            <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-fb-blue-tint text-fb-blue"><Store size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-bold leading-5 text-fb-text">Marketplace pickup</p>
              <p className="text-[13px] leading-4 text-fb-text-2">Things nearby you can pick up today.</p>
            </div>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fb-secondary-btn text-fb-text-2 hover:brightness-95"><X size={16} aria-hidden /></button>
          </div>
          <div className="min-h-0 overflow-y-auto p-3">
          <Button block icon={<Tag size={16} aria-hidden />} data-testid="market-sell" onClick={() => { setOpen(false); onSell(); }}>
            Sell something for pickup
          </Button>

          <p className="mb-1 mt-3 flex items-center gap-1.5 text-[15px] font-semibold text-fb-text"><span aria-hidden>✨</span> Tell Muse what you&apos;re looking for</p>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void addWant(); }}>
            <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-pill bg-fb-input px-3 focus-within:ring-2 focus-within:ring-fb-blue">
              <Search size={16} className="shrink-0 text-fb-text-2" aria-hidden />
              <input
                data-testid="want-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={200}
                placeholder="Desk chair under $40, 15 min drive"
                className="h-9 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fb-text-2"
              />
            </label>
            <Button type="submit" size="sm" disabled={busy || text.trim().length < 3}>{busy ? '…' : 'Save'}</Button>
          </form>
          {wants.length > 0 && (
            <ul data-testid="want-list" className="mt-2 flex flex-col gap-1">
              {wants.map((w) => (
                <li key={w.id} className="flex items-center gap-2 rounded-btn bg-fb-input px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 text-[13px] leading-4">
                    <span className="block truncate font-semibold capitalize text-fb-text">{w.item}</span>
                    {limits(w) && <span className="block text-fb-text-2">{limits(w)}</span>}
                  </span>
                  <button type="button" aria-label={`Stop looking for ${w.item}`} onClick={() => void removeWant(w.id)} className="rounded-full p-1 text-fb-text-2 hover:bg-fb-hover">
                    <X size={14} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="mt-3 flex items-center justify-between gap-2 text-[15px] text-fb-text">
            Show listings on the map
            <input type="checkbox" checked={showListings} onChange={(e) => onShowListings(e.target.checked)} className="size-4 accent-[#0866FF]" />
          </label>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
