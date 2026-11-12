'use client';

// Memories overview map: every place the viewer has a memory, as a photo pin (several memories at
// one venue share a pin with a count). Same stack as the Out Here map (MapLibre + OpenFreeMap
// Positron). Loaded only on /memories through next/dynamic({ ssr: false }); falls back to the
// list when WebGL is unavailable.
import { LngLatBounds, Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import type { CrewRow } from './data';
import { pinBounds, type MemoryPin } from './memoryPins';

setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href);

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

export type MemoriesMapProps = {
  pins: MemoryPin<CrewRow>[];
  selectedId: string | null;
  onSelect: (pinId: string) => void;
  onUnsupported: () => void;
  reducedMotion: boolean;
  /** Pixels hidden under the preview card at the bottom, so fly-to keeps the pin visible. */
  bottomInset: number;
};

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function pinElement(pin: MemoryPin<CrewRow>, onClick: () => void): HTMLButtonElement {
  const first = pin.memories[0];
  const photo = first.memories[0]?.photoUrl ?? null;
  const count = pin.memories.length;
  const el = document.createElement('button');
  el.type = 'button';
  el.dataset.testid = 'memory-pin';
  el.setAttribute('aria-label', `${pin.venueName ?? first.name}: ${count} ${count === 1 ? 'memory' : 'memories'}`);
  el.className = 'memory-pin relative block h-14 w-14 rounded-full border-[3px] border-white bg-fb-bg shadow-popover outline-none transition-transform focus-visible:ring-4 focus-visible:ring-fb-blue/40';
  // Built with DOM calls and textContent: venue emoji comes from user-created quests.
  const span = (className: string, text: string) => {
    const s = document.createElement('span');
    s.className = className;
    s.textContent = text;
    s.setAttribute('aria-hidden', 'true');
    return s;
  };
  if (photo) {
    const img = document.createElement('img');
    img.src = photo;
    img.alt = '';
    img.draggable = false;
    img.className = 'h-full w-full rounded-full object-cover';
    // A broken photo falls back to the venue emoji.
    img.addEventListener('error', () => img.replaceWith(span('flex h-full w-full items-center justify-center rounded-full text-[24px]', pin.emoji ?? '📍')));
    el.append(img);
    if (pin.emoji) el.append(span('absolute -bottom-1 -left-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[13px] shadow-card', pin.emoji));
  } else {
    el.append(span('flex h-full w-full items-center justify-center rounded-full text-[24px]', pin.emoji ?? '📍'));
  }
  if (count > 1) {
    el.append(span('absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-fb-blue px-1.5 text-[12px] font-bold text-white shadow-card', String(count)));
  }
  el.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return el;
}

export default function MemoriesMap({ pins, selectedId, onSelect, onUnsupported, reducedMotion, bottomInset }: MemoriesMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef(new Map<string, { marker: Marker; el: HTMLButtonElement }>());
  const select = useRef(onSelect);
  select.current = onSelect;

  // Create the map once.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    if (!hasWebGL()) { onUnsupported(); return; }
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: el, style: STYLE_URL, center: [-122.1477, 37.4847], zoom: 14,
        minZoom: 3, maxZoom: 18, attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
      });
    } catch {
      onUnsupported();
      return;
    }
    map.touchZoomRotate.disableRotation();
    // No zoom buttons: they would sit under the Map | List toggle. Scroll, pinch and double-tap zoom.
    mapRef.current = map;
    const current = markers.current;
    return () => {
      current.forEach(({ marker }) => marker.remove());
      current.clear();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one map per mount
  }, []);

  // Markers + first framing whenever the pins change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markers.current.forEach(({ marker }) => marker.remove());
    markers.current.clear();
    for (const pin of pins) {
      const el = pinElement(pin, () => select.current(pin.id));
      const marker = new Marker({ element: el, anchor: 'center' }).setLngLat(pin.coordinates).addTo(map);
      markers.current.set(pin.id, { marker, el });
    }
    const b = pinBounds(pins);
    if (!b) return;
    // Clear the top chips (count, toggle) and the bottom hint so no pin hides under them.
    const padding = { top: 110, left: 64, right: 64, bottom: bottomInset + 80 };
    if (pins.length === 1) map.jumpTo({ center: pins[0].coordinates, zoom: 15.5 });
    else map.fitBounds(new LngLatBounds(b[0], b[1]), { padding, maxZoom: 15.5, animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- framing is for new pins only
  }, [pins]);

  // Selection: ring the pin and bring it into view above the preview card.
  useEffect(() => {
    const map = mapRef.current;
    markers.current.forEach(({ el }, id) => {
      const on = id === selectedId;
      el.classList.toggle('ring-4', on);
      el.classList.toggle('ring-fb-blue', on);
      el.classList.toggle('scale-110', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      el.style.zIndex = on ? '2' : '1';
    });
    const pin = pins.find((p) => p.id === selectedId);
    if (!map || !pin) return;
    const opts = { center: pin.coordinates, padding: { top: 72, left: 24, right: 24, bottom: bottomInset + 24 } };
    if (reducedMotion) map.jumpTo(opts);
    else map.easeTo({ ...opts, duration: 600 });
  }, [selectedId, pins, reducedMotion, bottomInset]);

  return (
    <div
      ref={container}
      className="absolute inset-0"
      style={{ position: 'absolute' }}
      role="region"
      aria-label="Map of your memories"
      data-testid="memories-map"
    />
  );
}
