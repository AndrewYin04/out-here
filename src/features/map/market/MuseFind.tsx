'use client';
// Muse surfaces a listing that matches what the viewer told it they were looking for (card over
// the map), and the Marketplace menu where they tell Muse what they want or sell something.
import { Search, Store, Tag, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ApiFetchError, apiFetch, apiPost } from '@/features/data';
import { MuseLabel } from '@/features/outhere';
import { Button, cn, useToast } from '@/features/ui';
import type { MuseFind, MuseWantsResponse } from '@/shared/api';
import type { MuseWant } from '@/shared';
import { listingEmoji, money } from './useMarket';

export function MuseFindCard({ find, onView, onDismiss }: { find: MuseFind; onView: () => void; onDismiss: () => void }) {
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
            {find.source === 'muse' ? <MuseLabel className="py-0" /> : <span className="text-[12px] font-semibold text-fb-blue">✨ Found for you</span>}
            <span className="truncate text-[13px] text-fb-text-2">{find.title} · {money(find.priceUsd)}</span>
          </div>
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

/** The round Marketplace button in the map's bottom row, and its panel. */
export function MarketMenu({ wants, onWantsChanged, onSell, showListings, onShowListings }: MarketMenuProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
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
      {open && (
        <div
          data-testid="market-menu"
          className="absolute bottom-full right-0 mb-2 w-[min(340px,calc(100vw-32px))] rounded-card bg-fb-surface p-3 shadow-popover max-md:-right-16"
        >
          <p className="text-[17px] font-bold text-fb-text">Marketplace pickup</p>
          <p className="mb-2 text-[13px] leading-4 text-fb-text-2">Things nearby you can pick up today.</p>
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
      )}
    </div>
  );
}
