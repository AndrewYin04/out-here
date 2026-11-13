'use client';
// Friends on the Out Here map: an avatar pin with a green ring and a status chip per friend who
// shares with the viewer, plus the viewer's own pin. Below zoom 13 nearby pins merge into a
// cluster (tap zooms in); at closer zooms pins that would overlap fan out around their point.
// Chips never overlap: in order of distance (then most recently updated), each chip takes the
// first mode and side (above the avatar, then below) whose box is clear of every avatar and every
// chip already placed, else it is hidden. Desktop: the full thought wrapped to 2 lines (200 px
// wide), then the short form. Phones: the emoji plus the first 18 characters and an ellipsis, then
// the first 10; never the emoji alone.
// Markers are MapLibre HTML markers whose content React renders through portals.
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Avatar, cn } from '@/features/ui';
import type { FriendPin, LatLng, Profile } from '@/shared/types';
import { freeStatus, freeStatusLabel } from '@/shared/status';
import { CHIP_WRAP_W, chipText, placeChipsSided, thoughtFor, type ChipMode, type ChipOptions, type ChipSide } from './chips';
import { FriendCard } from './FriendCard';
import { onAvatar, onAvatarEnd } from '@/features/map/view3d';
import { firstName, isDesktop, panelPadding, updatedAgo, useFriendPins, useMyShare, PANEL_PX } from './useFindMy';

export type FriendsLayerProps = {
  map: MapLibreMap | null;
  viewer: Profile | null;
  /** Muse filter: show only these friends' pins. Omitted or null shows every friend. */
  keepIds?: ReadonlySet<string> | null;
  /** Muse filter: the reason row for a kept friend's card. */
  reasonFor?: ((friendId: string) => { label: string; text: string } | null) | null;
};

type MapLib = typeof import('maplibre-gl');

const CLUSTER_BELOW_ZOOM = 13;
const CLUSTER_PX = 56;
const OVERLAP_PX = 44;
/** Maps narrower than this get the short chip only. */
const NARROW_MAP_PX = 600;
// A chip that collides tries the other side of the avatar, then a shorter form, before it hides.
const WIDE_CHIPS: ChipOptions = { maxW: CHIP_WRAP_W, lines: 2, modes: ['full', 'short', 'mini'], sides: ['above', 'below'], shift: true };
const NARROW_CHIPS: ChipOptions = { modes: ['short', 'mini'], sides: ['above', 'below'], shift: true };
/** On phones, Friends mode first frames the friends within this distance so their chips separate. */
const LOCAL_KM = 3;

/** Loads maplibre-gl in the browser only (it touches window on import). */
function useMapLib(): MapLib | null {
  const [lib, setLib] = useState<MapLib | null>(null);
  useEffect(() => {
    let live = true;
    void import('maplibre-gl').then((m) => { if (live) setLib(m); });
    return () => { live = false; };
  }, []);
  return lib;
}

/** Bumps on every finished move or zoom, so screen-space grouping is recomputed. */
function useViewTick(map: MapLibreMap | null): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!map) return;
    const on = () => setTick((t) => t + 1);
    map.on('moveend', on);
    map.on('resize', on);
    on();
    return () => { map.off('moveend', on); map.off('resize', on); };
  }, [map]);
  return tick;
}

/** One HTML marker on the map; children render into it. */
export function MapMarker({ map, lib, at, offset = [0, 0], z = 1, children, label, markerAttr, friendId, markerRef }: {
  map: MapLibreMap; lib: MapLib; at: LatLng; offset?: [number, number]; z?: number; children: ReactNode; label?: string;
  /** Optional data-map-marker value (e.g. "me" for the You pin). */
  markerAttr?: string;
  /** Friend id for 3D avatar pin crossfade. */
  friendId?: string;
  /** Imperative handle so the 3D view can move / fade this marker without a React re-render. */
  markerRef?: { current: Marker | null };
}) {
  const [el] = useState(() => {
    const d = document.createElement('div');
    d.className = 'findmy-marker';
    return d;
  });
  const [marker, setMarker] = useState<Marker | null>(null);
  useEffect(() => {
    const m = new lib.Marker({ element: el, anchor: 'bottom' }).setLngLat([at.lng, at.lat]).addTo(map);
    setMarker(m);
    if (markerRef) markerRef.current = m;
    return () => { if (markerRef && markerRef.current === m) markerRef.current = null; m.remove(); };
  }, [lib, map, el]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { marker?.setLngLat([at.lng, at.lat]); }, [marker, at.lat, at.lng]);
  useEffect(() => { marker?.setOffset(offset); }, [marker, offset[0], offset[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    el.style.zIndex = String(z);
    if (label) el.setAttribute('aria-label', label);
    if (markerAttr) el.setAttribute('data-map-marker', markerAttr);
    else el.removeAttribute('data-map-marker');
    if (friendId) el.setAttribute('data-friend-id', friendId);
    else el.removeAttribute('data-friend-id');
  }, [el, z, label, markerAttr, friendId]);
  return createPortal(children, el);
}

type Group = { key: string; pins: FriendPin[]; at: LatLng };

/** Greedy screen-space grouping: pins within `px` of a group's first pin join it. */
function groupPins(map: MapLibreMap, pins: FriendPin[], px: number): Group[] {
  const groups: (Group & { x: number; y: number })[] = [];
  for (const p of pins) {
    const pt = map.project([p.location.lng, p.location.lat]);
    const g = groups.find((x) => Math.hypot(x.x - pt.x, x.y - pt.y) < px);
    if (g) g.pins.push(p);
    else groups.push({ key: p.friend.id, pins: [p], at: p.location, x: pt.x, y: pt.y });
  }
  return groups;
}

type Single = { pin: FriendPin; offset: [number, number]; chip: ChipMode; side: ChipSide; dx: number };

export function FriendsLayer({ map, viewer, keepIds = null, reasonFor = null }: FriendsLayerProps) {
  const lib = useMapLib();
  const tick = useViewTick(map);
  const { data } = useFriendPins();
  const { data: mine } = useMyShare();
  const [openId, setOpenId] = useState<string | null>(null);
  const meMarker = useRef<Marker | null>(null);
  const homeAt = useRef<LatLng | null>(null);
  const pins = useMemo(() => {
    const all = data?.pins ?? [];
    return keepIds ? all.filter((p) => keepIds.has(p.friend.id)) : all;
  }, [data, keepIds]);
  const openPin = pins.find((p) => p.friend.id === openId) ?? null;
  const me = mine?.share;
  homeAt.current = me?.location ?? null;

  // Prefer the You photo over MapCanvas's blue origin puck when both would show.
  useEffect(() => {
    if (!map || !me || !viewer) return;
    map.getContainer().dataset.hasMyPin = '1';
    return () => { delete map.getContainer().dataset.hasMyPin; };
  }, [map, me, viewer]);

  // 3D view: put You on the walked avatar and crossfade with the body; hide friend pins that have a 3D avatar.
  useEffect(() => {
    if (!map) return;
    const applyPinFade = (ids: string[] | undefined, opacity: number) => {
      const root = map.getContainer();
      for (const el of root.querySelectorAll<HTMLElement>('[data-friend-id]')) {
        const id = el.getAttribute('data-friend-id');
        if (!id) continue;
        if (ids?.includes(id)) {
          el.style.opacity = String(opacity);
          el.style.pointerEvents = opacity < 0.05 ? 'none' : '';
        } else {
          el.style.opacity = '';
          el.style.pointerEvents = '';
        }
      }
    };
    const unsub = onAvatar(map, (e) => {
      const m = meMarker.current;
      if (m) m.setLngLat([e.lng, e.lat]);
      const el = m?.getElement();
      if (el) {
        el.style.opacity = String(e.markerOpacity);
        el.style.pointerEvents = e.markerOpacity < 0.05 ? 'none' : '';
      }
      applyPinFade(e.avatarFriendIds, e.markerOpacity);
    });
    const onEnd = () => {
      const home = homeAt.current;
      const m = meMarker.current;
      if (m && home) m.setLngLat([home.lng, home.lat]);
      const el = m?.getElement();
      if (el) { el.style.opacity = ''; el.style.pointerEvents = ''; }
      applyPinFade(undefined, 1);
    };
    const unsubEnd = onAvatarEnd(map, onEnd);
    return () => { unsub(); unsubEnd(); onEnd(); };
  }, [map]);

  // Phones: once the pins load, frame the local friends and the viewer so their chips separate
  // (the default camera is set for the desktop map and leaves some of them off a 390 px screen).
  const [framed, setFramed] = useState(false);
  useEffect(() => {
    if (!map || framed || pins.length === 0 || isDesktop()) return;
    const c = map.getContainer();
    if (c.clientWidth >= NARROW_MAP_PX) return;
    const pts = [...pins.filter((p) => p.distanceKm < LOCAL_KM).map((p) => p.location), ...(me ? [me.location] : [])];
    setFramed(true);
    if (pts.length < 2) return;
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], {
      padding: { top: 150, bottom: 120, left: 36, right: 36 }, maxZoom: 16, duration: 0,
    });
  }, [map, pins, me, framed]);

  // Opens a friend's card and flies the map so their pin is clear of the card:
  // window event "findmy:open" { detail: { id, zoom? } } (the People sheet sends it).
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; zoom?: number }>).detail;
      setOpenId(d.id);
      const pin = pins.find((p) => p.friend.id === d.id);
      if (map && pin) {
        map.flyTo({ center: [pin.location.lng, pin.location.lat], zoom: d.zoom ?? map.getZoom(), padding: panelPadding('right'), essential: true });
      }
    };
    window.addEventListener('findmy:open', on);
    return () => window.removeEventListener('findmy:open', on);
  }, [map, pins]);

  function openFromPin(pin: FriendPin) {
    setOpenId(pin.friend.id);
    if (!map) return;
    // Move only when the card would cover the pin.
    const pt = map.project([pin.location.lng, pin.location.lat]);
    const c = map.getContainer();
    const covered = isDesktop() ? pt.x > c.clientWidth - PANEL_PX - 24 : pt.y > c.clientHeight * 0.5;
    if (covered) map.easeTo({ center: [pin.location.lng, pin.location.lat], padding: panelPadding('right'), duration: 400 });
  }

  function closeCard() {
    setOpenId(null);
    map?.easeTo({ padding: panelPadding(null), duration: 300 });
  }

  const layout = useMemo(() => {
    const empty = { clusters: [] as Group[], singles: [] as Single[] };
    if (!map) return empty;
    void tick;
    const zoom = map.getZoom();
    const c = map.getContainer();
    const view = { w: c.clientWidth, h: c.clientHeight };
    let clusters: Group[] = [];
    const placed: { pin: FriendPin; offset: [number, number] }[] = [];
    if (zoom < CLUSTER_BELOW_ZOOM) {
      const groups = groupPins(map, pins, CLUSTER_PX);
      clusters = groups.filter((g) => g.pins.length > 1);
      for (const g of groups) if (g.pins.length === 1) placed.push({ pin: g.pins[0], offset: [0, 0] });
    } else {
      for (const g of groupPins(map, pins, OVERLAP_PX)) {
        g.pins.forEach((pin, i) => {
          if (g.pins.length === 1) { placed.push({ pin, offset: [0, 0] }); return; }
          const angle = (2 * Math.PI * i) / g.pins.length - Math.PI / 2;
          const r = 30 + g.pins.length * 4;
          placed.push({ pin, offset: [Math.round(Math.cos(angle) * r), Math.round(Math.sin(angle) * r)] });
        });
      }
    }
    const screen = placed.map(({ pin, offset }) => {
      const pt = map.project([pin.location.lng, pin.location.lat]);
      return { pin, x: pt.x + offset[0], y: pt.y + offset[1] };
    });
    const mePt = me ? map.project([me.location.lng, me.location.lat]) : null;
    const opts = view.w < NARROW_MAP_PX ? NARROW_CHIPS : WIDE_CHIPS;
    const chips = placeChipsSided(screen, mePt ? { x: mePt.x, y: mePt.y } : null, view, false, opts);
    return {
      clusters,
      singles: placed.map((s) => {
        const c = chips.get(s.pin.friend.id);
        return { ...s, chip: c?.mode ?? 'none', side: c?.side ?? 'above', dx: c?.dx ?? 0 };
      }),
    };
  }, [map, pins, tick, me]);

  if (!map || !lib) return null;
  return (
    <>
      {/* One you-mark on the flat map: hide MapCanvas's blue origin puck while the You photo is up. */}
      <style>{'[data-has-my-pin] [data-map-marker="origin"]{display:none!important}'}</style>
      {me && viewer && (
        <MapMarker map={map} lib={lib} at={me.location} z={2} label="Your location" markerAttr="me" markerRef={meMarker}>
          <div className="flex flex-col items-center" data-testid="my-pin">
            <span className="rounded-full bg-white p-[2px] shadow-card ring-[3px] ring-fb-blue">
              <Avatar src={viewer.avatarUrl} name={viewer.name} size={36} decorative />
            </span>
            <span className="mt-0.5 rounded-full bg-fb-blue px-1.5 text-[11px] font-semibold leading-4 text-white">
              {me.paused ? 'Paused' : 'You'}
            </span>
          </div>
        </MapMarker>
      )}
      {layout.singles.map(({ pin, offset, chip, side, dx }) => (
        <MapMarker key={pin.friend.id} map={map} lib={lib} at={pin.location} offset={offset} z={openId === pin.friend.id ? 5 : 3} friendId={pin.friend.id}>
          <FriendPinView pin={pin} chip={chip} side={side} dx={dx} onOpen={() => openFromPin(pin)} />
        </MapMarker>
      ))}
      {layout.clusters.map((g) => (
        <MapMarker key={`c:${g.key}`} map={map} lib={lib} at={g.at} z={4}>
          <button
            type="button"
            data-testid="friend-cluster"
            aria-label={`${g.pins.length} friends: ${g.pins.map((p) => firstName(p.friend.name)).join(', ')}`}
            onClick={() => {
              const lats = g.pins.map((p) => p.location.lat);
              const lngs = g.pins.map((p) => p.location.lng);
              const span = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs));
              if (span < 0.002) map.flyTo({ center: [g.at.lng, g.at.lat], zoom: Math.max(map.getZoom() + 3, CLUSTER_BELOW_ZOOM) });
              else map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 80, maxZoom: 15 });
            }}
            className="flex items-center rounded-full bg-white py-1 pl-1 pr-2 shadow-popover"
          >
            <span className="flex -space-x-3">
              {g.pins.slice(0, 3).map((p) => (
                <span key={p.friend.id} className="rounded-full ring-2 ring-fb-green">
                  <Avatar src={p.friend.avatarUrl} name={p.friend.name} size={32} decorative className="ring-2 ring-white" />
                </span>
              ))}
            </span>
            <span className="ml-1.5 text-[13px] font-bold text-fb-text">{g.pins.length}</span>
          </button>
        </MapMarker>
      ))}
      <FriendCard pin={openPin} onClose={closeCard} museReason={openPin && reasonFor ? reasonFor(openPin.friend.id) : null} />
    </>
  );
}

function FriendPinView({ pin, chip, side, dx, onOpen }: { pin: FriendPin; chip: ChipMode; side: ChipSide; dx: number; onOpen: () => void }) {
  const b = pin.bubble;
  const text = chipText(pin);
  const shown = thoughtFor(b.thought, chip);
  // Green only while the friend shared a free window that is open now.
  const free = freeStatus(pin.availability ? [pin.availability] : []);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="friend-pin"
      data-handle={pin.friend.handle}
      data-chip={chip}
      data-chip-side={chip === 'none' ? undefined : side}
      aria-label={`${pin.friend.name}, ${freeStatusLabel(free)}${text ? `, ${text}` : ''}, updated ${updatedAgo(pin.updatedAt)}`}
      className="group relative flex flex-col items-center outline-none"
    >
      {chip !== 'none' && (
        <span
          className={cn(
            // The status shows on hover or keyboard focus; a tap opens the friend's card with all of it.
            'pointer-events-none absolute left-1/2 z-10 hidden w-max flex-col items-center rounded-[12px] bg-white px-2 py-1 text-center shadow-popover group-hover:flex group-focus-visible:flex',
            side === 'above' ? 'bottom-full mb-1' : 'top-full mt-1',
          )}
          style={{ maxWidth: CHIP_WRAP_W, transform: `translateX(calc(-50% + ${dx}px))` }}
        >
          <span className="flex max-w-full items-center gap-1 text-left text-[13px] font-semibold leading-4 text-fb-text" data-testid="friend-chip">
            {b.emoji && <span className="shrink-0 text-[16px] leading-none" aria-hidden>{b.emoji}</span>}
            {shown && (
              <span className={chip === 'full' ? 'line-clamp-2 break-words' : 'whitespace-nowrap'} data-testid="friend-chip-text">
                {shown}
              </span>
            )}
          </span>
          {shown && (
            <span className="hidden text-[11px] leading-[14px] text-fb-text-2 group-hover:block group-focus-visible:block">
              updated {updatedAgo(pin.updatedAt)}
            </span>
          )}
        </span>
      )}
      <span className={cn(
        'rounded-full bg-white p-[2px] shadow-card ring-[3px] transition-transform group-hover:scale-105',
        free.kind === 'free' ? 'ring-fb-green' : 'ring-fb-divider',
      )}>
        <Avatar src={pin.friend.avatarUrl} name={pin.friend.name} size={36} decorative />
      </span>
      {/* "Free till …" lives in the friend's card; on the map the green ring says they're free. */}
    </button>
  );
}
