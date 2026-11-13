'use client';
// Marketplace listings open for pickup, as pins on the Out Here map: the item's emoji and its
// price in a pill, with a green ring while available and amber "Reserved" while held. A pin that
// changes status pulses; a sold pin fades out. MapLibre HTML markers, like the friends layer.
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import type { MapListing } from '@/shared/api';
import { cleanTitle, listingEmoji, money } from './useMarket';

type Props = {
  map: MapLibreMap | null;
  listings: MapListing[];
  selectedId: string | null;
  /** Muse's find: its pin gets a ✨ badge. */
  foundId: string | null;
  onSelect: (id: string) => void;
};

/** root is the marker element (MapLibre owns its transform); el is the button we scale and fade. */
type Pin = { marker: Marker; root: HTMLDivElement; el: HTMLButtonElement; key: string; status: MapListing['status'] };

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

function paint(el: HTMLButtonElement, m: MapListing, selected: boolean, found: boolean) {
  const reserved = m.status === 'reserved';
  const title = cleanTitle(m.listing.title);
  el.dataset.status = m.status;
  if (el.parentElement) el.parentElement.style.zIndex = selected ? '5' : '';
  el.setAttribute('aria-label', `${title}, ${money(m.listing.priceUsd)}, ${reserved ? 'reserved' : 'available for pickup'}`);
  el.className = [
    'listing-pin flex items-center gap-1 rounded-pill bg-fb-surface py-0.5 pl-1 pr-2 text-[13px] font-semibold leading-5 text-fb-text shadow-card ring-2 transition-[box-shadow,transform] duration-200',
    reserved ? 'ring-[#E4A11B]' : 'ring-fb-green',
    selected ? 'z-10 scale-110 shadow-popover' : 'hover:scale-105',
  ].join(' ');
  el.replaceChildren();
  const emoji = document.createElement('span');
  emoji.className = 'flex size-6 items-center justify-center rounded-full bg-fb-input text-[15px]';
  emoji.textContent = listingEmoji(m.listing.title, m.listing.category);
  emoji.setAttribute('aria-hidden', 'true');
  const price = document.createElement('span');
  price.textContent = reserved ? 'Reserved' : money(m.listing.priceUsd);
  if (reserved) price.className = 'text-[#B7791F]';
  el.append(emoji, price);
  if (found && !reserved) {
    const spark = document.createElement('span');
    spark.className = 'absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-fb-blue text-[11px] text-white shadow-card';
    spark.textContent = '✨';
    spark.setAttribute('aria-hidden', 'true');
    el.append(spark);
  }
}

function pulse(el: HTMLElement) {
  if (reduced()) return;
  el.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 450, iterations: 2 });
}

export function ListingsLayer({ map, listings, selectedId, foundId, onSelect }: Props) {
  const pins = useRef(new Map<string, Pin>());
  const select = useRef(onSelect);
  useEffect(() => { select.current = onSelect; });

  useEffect(() => {
    if (!map) return;
    let live = true;
    void import('maplibre-gl').then(({ Marker: MarkerCls }) => {
      if (!live) return;
      const seen = new Set<string>();
      for (const m of listings) {
        const l = m.listing;
        if (!l.location) continue;
        seen.add(l.id);
        const selected = l.id === selectedId;
        const found = l.id === foundId;
        const key = `${m.status}:${l.priceUsd}:${l.location.lat}:${l.location.lng}:${selected}:${found}:${l.title}`;
        const cur = pins.current.get(l.id);
        if (cur) {
          if (cur.key !== key) {
            paint(cur.el, m, selected, found);
            cur.marker.setLngLat([l.location.lng, l.location.lat]);
            if (cur.status !== m.status) pulse(cur.el);
            cur.key = key;
            cur.status = m.status;
          }
          continue;
        }
        const root = document.createElement('div');
        const el = document.createElement('button');
        el.type = 'button';
        el.setAttribute('data-testid', `listing-pin-${l.id}`);
        el.style.position = 'relative';
        root.append(el);
        el.addEventListener('click', (e) => { e.stopPropagation(); select.current(l.id); });
        paint(el, m, selected, found);
        const marker = new MarkerCls({ element: root, anchor: 'center' }).setLngLat([l.location.lng, l.location.lat]).addTo(map);
        pins.current.set(l.id, { marker, root, el, key, status: m.status });
        if (!reduced()) el.animate?.([{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 300 });
      }
      // Gone from the list (sold, or the pickup window closed): fade out, then remove.
      for (const [id, p] of pins.current) {
        if (seen.has(id)) continue;
        pins.current.delete(id);
        if (reduced()) { p.marker.remove(); continue; }
        p.el.style.transition = 'opacity 400ms, transform 400ms';
        p.el.style.opacity = '0';
        p.el.style.transform = 'scale(0.6)';
        window.setTimeout(() => p.marker.remove(), 420);
      }
    });
    return () => { live = false; };
  }, [map, listings, selectedId, foundId]);

  // Remove every pin when the layer unmounts (Friends mode, or the layer switched off).
  useEffect(() => {
    const all = pins.current;
    return () => { for (const p of all.values()) p.marker.remove(); all.clear(); };
  }, [map]);

  return null;
}
