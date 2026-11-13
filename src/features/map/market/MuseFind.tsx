'use client';
// Muse surfaces a listing that matches what the viewer told it they were looking for (card over
// the map), and the Marketplace menu where they tell Muse what they want or sell something.
import { Search, Store, Tag, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiFetchError, apiFetch, apiPost } from '@/features/data';
import { MuseLabel } from '@/features/outhere';
import { Button, cn, useToast } from '@/features/ui';
import type { MuseWantsResponse } from '@/shared/api';
import { formatDemoTime, type MuseWant } from '@/shared';
import { listingEmoji, money, type ShownFind } from './useMarket';

/** Up to this many minutes on foot the card says "walk" (same as Muse's line). */
const WALKABLE_MIN = 15;

/** "track jacket under $25": the watch a want find matched, as the card and the sheet name it. */
export function watchLabel(w: Pick<MuseWant, 'item' | 'maxPrice'>): string {
  return w.maxPrice !== null ? `${w.item} under ${money(w.maxPrice)}` : w.item;
}

/** "2 min 25 s" / "40 s". */
function watchedFor(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m === 0 ? `${s} s` : s === 0 ? `${m} min` : `${m} min ${s} s`;
}

/** "just now" / "12 min ago" / "3 h ago" / "yesterday". */
function ago(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.round(min / 60)} h ago`;
  return min < 48 * 60 ? 'yesterday' : `${Math.round(min / (24 * 60))} days ago`;
}

/** One step of Muse's work: a dot on the rail, its name, and what happened. */
function Step({ tone, label, delay, children }: { tone: 'noticed' | 'checked' | 'decided'; label: string; delay: number; children: React.ReactNode }) {
  return (
    <li className="relative animate-step-in" style={{ animationDelay: `${delay}ms` }}>
      <span aria-hidden className={cn('absolute -left-[23px] top-[3px] flex size-3.5 items-center justify-center rounded-full',
        tone === 'noticed' && 'border-[3px] border-fb-blue bg-fb-surface',
        tone === 'checked' && 'bg-[#31A24C]',
        tone === 'decided' && 'bg-fb-blue')} />
      <p className="text-[13px] font-extrabold leading-4 text-fb-text">{label}</p>
      <div className="mt-1">{children}</div>
    </li>
  );
}

/**
 * Muse found a listing for you. The card shows its work, in order: what Muse noticed (the watch
 * you set, or the videos and Reels you watched), what the app checked in code (price against your
 * budget, the walk, the pickup window, how new it is), and what Muse decided, in its own words.
 */
export function MuseFindCard({ find, watch = null, want = null, walkMin = null, onView, onDismiss }: {
  find: ShownFind;
  /** The watch this find matched ("track jacket under $25"); null for a find from what you watch. */
  watch?: string | null;
  /** That watch, for when you set it. */
  want?: MuseWant | null;
  /** Minutes on foot from you to the pickup spot, when known. */
  walkMin?: number | null;
  onView: () => void;
  onDismiss: () => void;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => { const id = window.requestAnimationFrame(() => setShown(true)); return () => window.cancelAnimationFrame(id); }, []);
  const budget = want?.maxPrice ?? null;
  const checks = [
    budget !== null ? `${money(find.priceUsd)}, under your ${money(budget)}` : `${money(find.priceUsd)} from ${find.sellerFirstName}`,
    walkMin !== null && walkMin <= WALKABLE_MIN ? `${walkMin} min walk from you` : `${find.driveMin} min drive from you`,
    `Pickup open until ${formatDemoTime(find.pickupUntil)}`,
    find.listedMinAgo <= 15 ? (find.listedMinAgo < 1 ? 'Listed just now' : `Listed ${find.listedMinAgo} min ago`) : null,
  ].filter((c): c is string => !!c);
  const viewed = find.viewed ?? [];
  const noticed = !!watch || viewed.length > 0;

  return (
    <div
      role="status"
      data-testid="muse-find"
      data-source={find.source}
      className={cn(
        'pointer-events-auto w-full max-w-[440px] rounded-card bg-fb-surface p-4 shadow-popover transition-all duration-300 motion-reduce:transition-none',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
      )}
    >
      <div className="flex items-center gap-2">
        {find.source === 'muse' ? (
          <>
            <MuseLabel className="shrink-0 py-0" />
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-fb-text-2">found this for you</span>
          </>
        ) : <span className="min-w-0 flex-1 whitespace-nowrap text-[14px] font-semibold text-fb-blue">✨ Found for you</span>}
        <button type="button" aria-label="Dismiss" onClick={onDismiss} className="-mr-1 rounded-full p-1 text-fb-text-2 hover:bg-fb-hover">
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-3">
        {find.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={find.imageUrl} alt="" className="size-16 shrink-0 rounded-card object-cover" />
        ) : (
          <span className="flex size-16 shrink-0 items-center justify-center rounded-card bg-fb-input text-[30px]" aria-hidden>
            {listingEmoji(find.title, '')}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[16px] font-bold leading-5 text-fb-text">{find.title}</p>
          <p className="text-[18px] font-extrabold leading-6 text-fb-text">{money(find.priceUsd)}</p>
        </div>
      </div>

      <ol aria-label="How Muse found it" className="relative mt-3 flex flex-col gap-3 pl-[23px]">
        <span aria-hidden className="absolute bottom-2 left-[6px] top-2 w-0.5 bg-fb-blue-tint" />
        {noticed && (
          <Step tone="noticed" label="Noticed" delay={120}>
            {watch && (
              <p data-testid="muse-find-watch" className="text-[14px] leading-[18px] text-fb-text">
                You asked Muse to watch for <b>{watch}</b>
                {want && <span className="text-fb-text-2">, {ago(want.createdAt)}</span>}
              </p>
            )}
            {viewed.length > 0 && (
              <ul data-testid="muse-find-viewed" className="flex flex-col gap-1.5">
                {viewed.map((v) => (
                  <li key={v.key} className="flex items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v.posterUrl} alt="" className={cn('shrink-0 rounded-[4px] bg-fb-input object-cover', v.format === 'reel' ? 'h-11 w-[25px]' : 'h-9 w-14')} />
                    <span className="min-w-0 text-[14px] leading-[18px]">
                      <b className="line-clamp-1 text-fb-text">{v.title}</b>
                      <span className="text-fb-text-2">You watched this {v.format === 'reel' ? 'Reel' : 'video'} for {watchedFor(v.seconds)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Step>
        )}
        <Step tone="checked" label="Checked" delay={noticed ? 420 : 120}>
          <ul data-testid="muse-find-checks" className="flex flex-col gap-0.5 text-[14px] leading-[18px] text-fb-text">
            {checks.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </Step>
        <Step tone="decided" label="Decided" delay={noticed ? 720 : 420}>
          <p data-testid="muse-find-line" className="text-[15px] leading-5 text-fb-text">{find.line}</p>
        </Step>
      </ol>

      <div className="mt-3 flex gap-2">
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
