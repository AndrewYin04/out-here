'use client';
// A full-screen Friends map (MapLibre + OpenFreeMap Positron) with the Find My layer and the
// People button. The Out Here map mounts FriendsLayer on its own map; this one backs
// /out-here/friends.
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { useViewer } from '@/features/data';
import { DEMO_CENTER } from '@/shared/demo';
import type { Profile } from '@/shared/types';
import { FriendsLayer } from './FriendsLayer';
import { PeopleButton } from './PeopleSheet';
import { SharingButton } from './SharingButton';
import { useFriendPins, useMyShare } from './useFindMy';

const STYLE = 'https://tiles.openfreemap.org/styles/positron';

export function FindMyMap() {
  const box = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const { viewer } = useViewer();
  useEffect(() => {
    let m: MapLibreMap | null = null;
    let live = true;
    void import('maplibre-gl').then(({ Map, setWorkerUrl }) => {
      if (!live || !box.current) return;
      // maplibre derives its worker URL from import.meta.url, which the bundler rewrites; point it at the emitted file
      setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href);
      m = new Map({
        container: box.current, style: STYLE, center: [DEMO_CENTER.lng, DEMO_CENTER.lat], zoom: 14.2,
        attributionControl: { compact: true },
      });
      setMap(m);
    });
    return () => { live = false; m?.remove(); };
  }, []);
  // Frame the viewer and friends within walking distance once, when they first load.
  const { data: pins } = useFriendPins();
  const { data: mine } = useMyShare();
  const framed = useRef(false);
  useEffect(() => {
    if (!map || framed.current || !pins || !mine) return;
    framed.current = true;
    const pts = pins.pins.filter((p) => p.walkingMinutes !== null && p.walkingMinutes <= 30).map((p) => p.location);
    if (mine.share) pts.push(mine.share.location);
    if (pts.length < 2) return;
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: { top: 120, bottom: 60, left: 100, right: 100 }, maxZoom: 15.5, duration: 0 });
  }, [map, pins, mine]);
  const profile = { id: viewer.id, name: viewer.name, avatarUrl: viewer.avatarUrl, handle: viewer.handle } as Profile;
  return (
    <div className="relative h-[calc(100dvh-112px)] overflow-hidden bg-[#E9EEF2] md:h-[calc(100dvh-56px)]">
      <div className="absolute inset-0" data-testid="findmy-map">
        {/* maplibre sets position: relative on its container, so the container fills a positioned box */}
        <div ref={box} className="h-full w-full" />
      </div>
      <FriendsLayer map={map} viewer={profile} />
      <div className="absolute left-3 top-3 z-10 flex gap-2">
        <PeopleButton map={map} />
        <SharingButton />
      </div>
    </div>
  );
}
