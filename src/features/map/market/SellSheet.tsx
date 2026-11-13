'use client';
// "Sell for pickup": the seller drops a pin (drag it on the map), names the item and price, says
// where exactly to meet (only the buyer they accept sees it) and how long they're around.
// One availability window replaces the back-and-forth about when to meet.
import { ImagePlus, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { ApiFetchError, apiPost, uploadImage } from '@/features/data';
import { Button, IconButton, cn } from '@/features/ui';
import { formatDemoTime, type LatLng } from '@/shared';
import type { CreateListingBody, MapListing, MapListingResponse } from '@/shared/api';
import { nextAtClock } from '../create/time';

const CATEGORIES = ['Furniture', 'Electronics', 'Home', 'Clothing', 'Sports', 'Books', 'Other'] as const;

export type SellSheetProps = {
  at: LatLng;
  now: Date;
  onClose: () => void;
  onPosted: (l: MapListing) => void;
};

/** "Available until" choices: +1 h, +2 h, +3 h (rounded to :00/:30) and 5:00 PM when it's 45 min to 12 h away. */
export function untilChoices(now: Date): Date[] {
  const half = 30 * 60_000;
  const out = [60, 120, 180].map((m) => new Date(Math.ceil((now.getTime() + m * 60_000) / half) * half));
  const five = nextAtClock('17:00', now);
  if (five) {
    const ahead = five.getTime() - now.getTime();
    if (ahead >= 45 * 60_000 && ahead <= 12 * 3_600_000) out.push(five);
  }
  return [...new Map(out.map((d) => [d.getTime(), d])).values()].sort((a, b) => a.getTime() - b.getTime()).slice(0, 4);
}

export function SellSheet({ at, now, onClose, onPosted }: SellSheetProps) {
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<string>('Furniture');
  const [spot, setSpot] = useState('');
  const choices = useMemo(() => untilChoices(now), [now]);
  const [until, setUntil] = useState<string>(() => (choices.find((d) => formatDemoTime(d.toISOString()) === '5:00 PM') ?? choices[1] ?? choices[0]).toISOString());
  const [photo, setPhoto] = useState<{ url: string | null; busy: boolean; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const priceNum = Number(price);
  const ok = title.trim().length >= 2 && price !== '' && Number.isFinite(priceNum) && priceNum >= 0 && spot.trim().length > 0 && !photo?.busy;

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setPhoto({ url: null, busy: true, error: false });
    try {
      setPhoto({ url: await uploadImage(file), busy: false, error: false });
    } catch {
      setPhoto({ url: null, busy: false, error: true });
    }
  }

  async function submit() {
    if (!ok) return;
    setBusy(true);
    setError(null);
    const body: CreateListingBody = {
      title: title.trim(), priceUsd: priceNum, category, imageUrl: photo?.url ?? null,
      location: at, pickupSpot: spot.trim(), pickupUntil: until,
    };
    try {
      const r = await apiPost<MapListingResponse>('/api/listings', body);
      onPosted(r.listing);
    } catch (e) {
      setError(e instanceof ApiFetchError ? e.message : 'Could not list it. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const input = 'h-10 w-full rounded-btn bg-fb-input px-3 text-[15px] text-fb-text outline-none placeholder:text-fb-text-2 focus:ring-2 focus:ring-fb-blue';
  return (
    <section
      aria-label="Sell for pickup"
      data-testid="sell-sheet"
      className={cn(
        'absolute inset-x-0 bottom-0 z-30 flex max-h-[78%] flex-col rounded-t-[16px] bg-fb-surface shadow-popover',
        'md:inset-x-auto md:bottom-4 md:left-4 md:top-4 md:max-h-none md:w-[400px] md:rounded-card',
      )}
    >
      <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-fb-divider md:hidden" aria-hidden />
      <header className="flex shrink-0 items-start justify-between px-4 pb-1 pt-2">
        <div>
          <h2 className="text-[20px] font-bold text-fb-text">Sell for pickup</h2>
          <p className="text-[13px] text-fb-text-2">Pin dropped. Drag it to your pickup spot.</p>
        </div>
        <IconButton label="Close" size="md" onClick={onClose}><X size={20} aria-hidden /></IconButton>
      </header>
      <form
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-1"
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
      >
        <div className="flex gap-3">
          {photo?.url ? (
            <div className="relative size-20 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="size-20 rounded-card object-cover" />
              <button type="button" aria-label="Remove photo" onClick={() => setPhoto(null)}
                className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white">
                <X size={14} aria-hidden />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex size-20 shrink-0 flex-col items-center justify-center gap-1 rounded-card border border-dashed border-fb-divider text-[12px] font-semibold text-fb-text-2 hover:bg-fb-hover"
            >
              <ImagePlus size={20} aria-hidden />
              {photo?.busy ? 'Uploading…' : photo?.error ? 'Try again' : 'Photo'}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <input data-testid="sell-title" className={input} placeholder="What are you selling?" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
            <label className="flex items-center rounded-btn bg-fb-input px-3 focus-within:ring-2 focus-within:ring-fb-blue">
              <span className="text-[15px] text-fb-text-2">$</span>
              <input data-testid="sell-price" inputMode="decimal" className="h-10 w-full bg-transparent px-1 text-[15px] outline-none" placeholder="Price"
                value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} aria-label="Price in dollars" />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Category">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={category === c} onClick={() => setCategory(c)}
              className={cn('h-8 rounded-pill px-3 text-[13px] font-semibold', category === c ? 'bg-fb-blue-tint text-fb-blue' : 'bg-fb-input text-fb-text hover:bg-fb-hover')}>
              {c}
            </button>
          ))}
        </div>

        <div>
          <p className="mb-1 text-[15px] font-semibold text-fb-text">Available for pickup until</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Available until">
            {choices.map((d) => {
              const v = d.toISOString();
              return (
                <button key={v} type="button" role="radio" aria-checked={until === v} onClick={() => setUntil(v)}
                  className={cn('h-8 rounded-pill px-3 text-[15px] font-semibold', until === v ? 'bg-fb-blue-tint text-fb-blue' : 'bg-fb-input text-fb-text hover:bg-fb-hover')}>
                  {formatDemoTime(v)}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[12px] leading-4 text-fb-text-2">Your listing shows on the Out Here map until then.</p>
        </div>

        <div>
          <input data-testid="sell-spot" className={input} placeholder="Exact pickup spot (e.g. blue door, 12 Ivy Dr)" maxLength={120} value={spot} onChange={(e) => setSpot(e.target.value)} />
          <p className="mt-1 text-[12px] leading-4 text-fb-text-2">Everyone sees the neighbourhood. Only the buyer you accept gets this spot.</p>
        </div>

        {error && <p role="alert" className="text-[13px] text-fb-red">{error}</p>}
        <Button type="submit" data-testid="sell-submit" block disabled={!ok || busy}>{busy ? 'Listing…' : 'List for pickup'}</Button>
      </form>
    </section>
  );
}
