'use client';
// A Marketplace listing open for pickup, over the map: bottom sheet on phones, left panel on
// desktop (same shell as QuestPanel). Buyers reserve it for pickup with an offer and an ETA; once
// the seller accepts, they get a countdown, the exact spot and directions. The seller answers
// requests in one tap, then marks it sold (the pin leaves every map) or releases the hold.
import { Car, Check, Clock, Footprints, MapPin, Navigation, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ApiFetchError, apiPost } from '@/features/data';
import { Avatar, Button, IconButton, Skeleton, cn, useToast } from '@/features/ui';
import { formatDemoTime, type LatLng } from '@/shared';
import type { HoldRequestBody, MapListing, MapListingResponse } from '@/shared/api';
import { MapAttribution } from '../MapAttribution';
import { cleanTitle, countdown, listingEmoji, money, useMapListing } from './useMarket';

export type ListingSheetProps = {
  listingId: string;
  viewerId: string;
  /** Driving minutes from the viewer, when known. */
  driveMin: number | null;
  /** Walking minutes from the viewer, when known. Within WALKABLE_MIN the sheet shows the walk. */
  walkMin?: number | null;
  /** Muse's line when this listing is the viewer's find. */
  museLine: string | null;
  onClose: () => void;
  onChanged: () => void;
};

const ETAS = [15, 30, 45, 60] as const;
/** Same cut-off as Muse's find line: up to this many minutes on foot reads as a walk, not a drive. */
const WALKABLE_MIN = 15;

function useTick(ms: number): Date {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setT(new Date()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return t;
}

const ago = (iso: string, at: Date) => {
  const m = Math.max(0, Math.round((at.getTime() - new Date(iso).getTime()) / 60_000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

const directionsUrl = (p: LatLng) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;

export function ListingSheet({ listingId, viewerId, driveMin, walkMin = null, museLine, onClose, onChanged }: ListingSheetProps) {
  const api = useMapListing(listingId);
  const m = api.data?.listing ?? null;
  const toast = useToast();
  const at = useTick(1000);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function run(fn: () => Promise<MapListingResponse>, done?: string) {
    setBusy(true);
    try {
      await fn();
      await api.refetch();
      onChanged();
      if (done) toast.show(done);
    } catch (e) {
      toast.show(e instanceof ApiFetchError ? e.message : 'Something went wrong. Try again.');
      void api.refetch();
    } finally {
      setBusy(false);
    }
  }

  const l = m?.listing;
  const title = l ? cleanTitle(l.title) : '';
  const isSeller = !!l && l.sellerId === viewerId;

  return (
    <section
      aria-label={title || 'Listing'}
      data-testid="listing-sheet"
      data-status={m?.status}
      className="absolute inset-x-0 bottom-0 z-30 flex max-h-[62%] flex-col rounded-t-sheet bg-fb-surface shadow-popover md:bottom-auto md:left-4 md:right-auto md:top-4 md:max-h-[calc(100%-32px)] md:w-[380px] md:rounded-card"
    >
      <MapAttribution className="absolute bottom-full right-0 mb-1 md:hidden" />
      <div className="flex justify-center pt-2 md:hidden" aria-hidden>
        <span className="h-1 w-10 rounded-full bg-fb-divider" />
      </div>
      <div className="flex items-start gap-3 px-4 pb-2 pt-2 md:pt-4">
        {l?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={l.imageUrl} alt="" className="size-16 shrink-0 rounded-card object-cover" />
        ) : (
          <span className="flex size-16 shrink-0 items-center justify-center rounded-card bg-fb-input text-[32px]" aria-hidden>
            {l ? listingEmoji(l.title, l.category) : ''}
          </span>
        )}
        <div className="min-w-0 flex-1">
          {l ? (
            <>
              <p className="text-[20px] font-bold leading-6 text-fb-text">{money(l.priceUsd)}</p>
              <h2 className="text-[17px] font-semibold leading-[22px] text-fb-text">{title}</h2>
              <StatusLine m={m!} at={at} />
            </>
          ) : (
            <Skeleton className="h-12 w-40" />
          )}
        </div>
        <IconButton label="Close" size="md" onClick={onClose} className="-mr-2 -mt-1"><X size={20} aria-hidden /></IconButton>
      </div>

      {m && l && (
        <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-4">
          {museLine && !isSeller && m.status === 'available' && (
            <p data-testid="listing-muse-line" className="rounded-card bg-fb-blue-tint px-3 py-2 text-[14px] leading-[19px] text-fb-text">
              <span className="mr-1 font-semibold text-fb-blue">✨ Muse</span>{museLine}
            </p>
          )}

          <ul className="flex flex-col gap-1.5 text-[15px] text-fb-text">
            <li className="flex items-center gap-2">
              <MapPin size={18} className="shrink-0 text-fb-text-2" aria-hidden />
              <span>
                {m.exact && l.pickupSpot ? <><strong className="font-semibold">{l.pickupSpot}</strong> · {l.pickupLabel}</> : <>Pickup around {l.pickupLabel ?? 'nearby'}</>}
              </span>
            </li>
            {!isSeller && walkMin !== null && walkMin <= WALKABLE_MIN ? (
              <li className="flex items-center gap-2"><Footprints size={18} className="shrink-0 text-fb-text-2" aria-hidden />{walkMin} min walk</li>
            ) : driveMin !== null && !isSeller && (
              <li className="flex items-center gap-2"><Car size={18} className="shrink-0 text-fb-text-2" aria-hidden />{driveMin} min drive</li>
            )}
            {l.pickupUntil && m.status !== 'sold' && (
              <li className="flex items-center gap-2"><Clock size={18} className="shrink-0 text-fb-text-2" aria-hidden />Available for pickup until {formatDemoTime(l.pickupUntil)}</li>
            )}
          </ul>

          <div className="flex items-center gap-2">
            <Avatar src={m.seller.avatarUrl} name={m.seller.name} size={36} />
            <p className="text-[13px] leading-4 text-fb-text-2">
              <span className="font-semibold text-fb-text">{isSeller ? 'You' : m.seller.name}</span> listed this {ago(l.createdAt, at)}
              {l.condition ? ` · ${l.condition}` : ''}
            </p>
          </div>
          {l.description && <p className="text-[15px] leading-5 text-fb-text">{l.description}</p>}

          {isSeller
            ? <SellerActions m={m} at={at} busy={busy} run={run} />
            : <BuyerActions m={m} at={at} busy={busy} run={run} />}

          {!isSeller && (
            <button
              type="button"
              onClick={() => toast.show('Thanks. We\'ll take a look at this listing.')}
              className="self-start text-[13px] text-fb-text-2 hover:underline"
            >
              Report listing
            </button>
          )}
        </div>
      )}
      {api.error && !m && <p className="px-4 pb-4 text-[15px] text-fb-text-2">This listing isn&apos;t available.</p>}
    </section>
  );
}

function StatusLine({ m, at }: { m: MapListing; at: Date }) {
  if (m.status === 'sold') return <p className="mt-0.5 text-[13px] font-semibold text-fb-text-2">Sold</p>;
  if (m.status === 'reserved') {
    return (
      <p className="mt-0.5 text-[13px] font-semibold text-[#B7791F]">
        Reserved{m.reservedUntil ? ` · ${countdown(m.reservedUntil, at)} left` : ''}
      </p>
    );
  }
  return <p className="mt-0.5 text-[13px] font-semibold text-fb-green">Available for pickup</p>;
}

type Run = (fn: () => Promise<MapListingResponse>, done?: string) => Promise<void>;

function BuyerActions({ m, at, busy, run }: { m: MapListing; at: Date; busy: boolean; run: Run }) {
  const l = m.listing;
  const hold = m.myHold;
  const sellerFirst = m.seller.name.split(' ')[0];
  const [open, setOpen] = useState(false);

  if (m.status === 'sold') {
    return <p className="rounded-card bg-fb-input px-3 py-2 text-[15px] text-fb-text">{hold?.status === 'completed' ? 'You picked this up. Enjoy it!' : 'This sold. It\'s off the map now.'}</p>;
  }
  if (hold?.status === 'accepted' && m.exact && l.location) {
    return (
      <div data-testid="hold-accepted" className="flex flex-col gap-2 rounded-card border border-fb-green/40 bg-[#E7F6EA] px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[15px] font-semibold text-fb-text">
          <Check size={18} className="text-fb-green" aria-hidden />
          Held for you · <span data-testid="hold-countdown">{countdown(hold.expiresAt!, at)}</span> left
        </p>
        <p className="text-[13px] leading-[17px] text-fb-text-2">
          {sellerFirst} will meet you at {l.pickupSpot}. Bring {money(hold.offerUsd)}.
        </p>
        <div className="flex gap-2">
          <a
            href={directionsUrl(l.location)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-btn bg-fb-blue px-3 text-[15px] font-semibold text-white hover:bg-fb-blue-hover"
          >
            <Navigation size={16} aria-hidden /> Directions
          </a>
          <Button variant="secondary" disabled={busy} onClick={() => run(() => apiPost(`/api/listing-holds/${hold.id}/release`), 'Hold released.')}>
            Can&apos;t make it
          </Button>
        </div>
      </div>
    );
  }
  if (hold?.status === 'requested') {
    return (
      <div data-testid="hold-requested" className="flex items-center justify-between gap-2 rounded-card bg-fb-input px-3 py-2">
        <p className="text-[15px] text-fb-text">Request sent. Waiting on {sellerFirst}…</p>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => apiPost(`/api/listing-holds/${hold.id}/release`), 'Request cancelled.')}>
          Cancel
        </Button>
      </div>
    );
  }
  if (m.status === 'reserved') {
    return (
      <p className="rounded-card bg-fb-input px-3 py-2 text-[15px] text-fb-text">
        Someone has this on hold{m.reservedUntil ? ` until ${formatDemoTime(m.reservedUntil)}` : ''}. If the pickup doesn&apos;t happen, it comes back here.
      </p>
    );
  }
  const note = hold?.status === 'expired' ? 'Your last hold expired.' : hold?.status === 'declined' ? `${sellerFirst} couldn't do your last request.` : null;
  return (
    <div className="flex flex-col gap-2">
      {note && <p className="text-[13px] text-fb-text-2">{note}</p>}
      {open
        ? <ReserveForm m={m} at={at} busy={busy} run={run} onCancel={() => setOpen(false)} />
        : <Button data-testid="reserve-btn" block onClick={() => setOpen(true)}>Reserve for pickup</Button>}
    </div>
  );
}

function ReserveForm({ m, at, busy, run, onCancel }: { m: MapListing; at: Date; busy: boolean; run: Run; onCancel: () => void }) {
  const l = m.listing;
  const minutesLeft = l.pickupUntil ? Math.floor((new Date(l.pickupUntil).getTime() - at.getTime()) / 60_000) : 0;
  const etas = ETAS.filter((e) => e <= minutesLeft);
  const [eta, setEta] = useState<number>(etas.includes(30) ? 30 : (etas[etas.length - 1] ?? 15));
  const [offer, setOffer] = useState(String(l.priceUsd));
  const auto = useMemo(() => `${money(Number(offer) || 0)}, I can be there in ${eta} minutes.`, [offer, eta]);
  const [message, setMessage] = useState<string | null>(null);
  const body: HoldRequestBody = { offerUsd: Math.max(0, Number(offer) || 0), etaMin: eta, message: message ?? auto };

  if (etas.length === 0) return <p className="text-[15px] text-fb-text-2">The pickup window is about to close.</p>;
  return (
    <form
      data-testid="reserve-form"
      className="flex flex-col gap-2.5 rounded-card border border-fb-divider p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => apiPost(`/api/listings/${l.id}/holds`, body), `Sent to ${m.seller.name.split(' ')[0]}.`);
      }}
    >
      <label className="flex items-center justify-between gap-2 text-[15px] text-fb-text">
        Your offer
        <span className="flex items-center rounded-btn bg-fb-input px-2">
          <span className="text-fb-text-2">$</span>
          <input
            inputMode="decimal"
            value={offer}
            onChange={(e) => setOffer(e.target.value.replace(/[^\d.]/g, ''))}
            className="h-9 w-16 bg-transparent px-1 text-right text-[15px] outline-none"
            aria-label="Offer in dollars"
          />
        </span>
      </label>
      <div>
        <p className="mb-1 text-[15px] text-fb-text">I can be there in</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Arrival time">
          {etas.map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={eta === e}
              onClick={() => setEta(e)}
              className={cn('h-8 rounded-pill px-3 text-[15px] font-semibold', eta === e ? 'bg-fb-blue-tint text-fb-blue' : 'bg-fb-input text-fb-text hover:bg-fb-hover')}
            >
              {e} min
            </button>
          ))}
        </div>
      </div>
      <textarea
        value={message ?? auto}
        onChange={(e) => setMessage(e.target.value)}
        rows={2}
        maxLength={300}
        aria-label="Message to the seller"
        className="resize-none rounded-btn bg-fb-input px-3 py-2 text-[15px] leading-5 outline-none focus:ring-2 focus:ring-fb-blue"
      />
      <div className="flex gap-2">
        <Button type="submit" data-testid="reserve-send" className="flex-1" disabled={busy}>Send request</Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
      <p className="text-[12px] leading-4 text-fb-text-2">You get the exact spot when the seller accepts. The hold lasts your arrival time plus 15 minutes.</p>
    </form>
  );
}

function SellerActions({ m, at, busy, run }: { m: MapListing; at: Date; busy: boolean; run: Run }) {
  const l = m.listing;
  if (m.status === 'sold') return <p className="rounded-card bg-fb-input px-3 py-2 text-[15px] text-fb-text">Sold. It&apos;s off the map.</p>;
  const held = m.requests.find((r) => r.status === 'accepted');
  const open = m.requests.filter((r) => r.status === 'requested');
  return (
    <div className="flex flex-col gap-2">
      {held && (
        <div data-testid="seller-held" className="flex flex-col gap-2 rounded-card border border-[#E4A11B]/50 bg-[#FFF6E0] px-3 py-2.5">
          <p className="text-[15px] font-semibold text-fb-text">
            Held for {held.buyer.name.split(' ')[0]} · {countdown(held.expiresAt!, at)} left
          </p>
          <p className="text-[13px] text-fb-text-2">{money(held.offerUsd)} · arriving in about {held.etaMin} min</p>
          <div className="flex gap-2">
            <Button data-testid="mark-sold" className="flex-1" disabled={busy} onClick={() => run(() => apiPost(`/api/listings/${l.id}/sold`), 'Marked sold. It\'s off the map.')}>
              Mark sold
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => run(() => apiPost(`/api/listing-holds/${held.id}/release`), 'Hold released.')}>
              Release
            </Button>
          </div>
        </div>
      )}
      {open.length > 0 && (
        <ul data-testid="seller-requests" className="flex flex-col gap-2">
          {open.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 rounded-card border border-fb-divider px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Avatar src={r.buyer.avatarUrl} name={r.buyer.name} size={32} />
                <p className="min-w-0 flex-1 text-[15px] leading-5 text-fb-text">
                  <strong className="font-semibold">{r.buyer.name.split(' ')[0]}</strong> · {money(r.offerUsd)} · in {r.etaMin} min
                </p>
              </div>
              {r.message && <p className="text-[15px] leading-5 text-fb-text">&ldquo;{r.message}&rdquo;</p>}
              {!held && (
                <div className="flex gap-2">
                  <Button data-testid="accept-hold" className="flex-1" disabled={busy}
                    onClick={() => run(() => apiPost(`/api/listing-holds/${r.id}/respond`, { accept: true }), `Held for ${r.buyer.name.split(' ')[0]}.`)}>
                    Accept
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={() => run(() => apiPost(`/api/listing-holds/${r.id}/respond`, { accept: false }))}>
                    Decline
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!held && open.length === 0 && (
        <p className="rounded-card bg-fb-input px-3 py-2 text-[15px] text-fb-text">
          No requests yet. It&apos;s on the map{l.pickupUntil ? ` until ${formatDemoTime(l.pickupUntil)}` : ''}.
        </p>
      )}
      {!held && (
        <Button variant="secondary" disabled={busy} onClick={() => run(() => apiPost(`/api/listings/${l.id}/sold`), 'Marked sold. It\'s off the map.')}>
          Mark sold
        </Button>
      )}
    </div>
  );
}
