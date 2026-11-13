'use client';
// The Out Here dock: the map's controls in one place instead of scattered buttons.
//  - Above the sheet: "I'm free" (it also shows your status), one contextual action (Post a plan
//    in Explore, People in Friends) and, on the right, Map/3D.
//  - The sheet: a handle and one row of pills. Explore and Friends switch the map; Your plans and
//    Memories open those pages. The selected pill is wide and filled with its icon and label;
//    the others are tinted and show only their icon (each keeps its name for screen readers).
//  - Drag the handle up (or tap it, or press Enter) to list the plans on the map; down to fold it.
import { CalendarCheck, Images, Map as MapIcon, MapPin, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { PeopleButton } from '@/features/map/friends';
import { ImFreeButton } from '@/features/outhere';
import { cn, useSheetDrag } from '@/features/ui';
import type { Quest } from '@/shared';
import { seatBadge, seatsLeftOf, startsLabel, walkLabel } from './format';
import type { MapMode } from './types';

type Props = {
  mode: MapMode;
  onMode: (m: MapMode) => void;
  view: 'map' | '3d';
  onToggleView: (() => void) | null;
  onCreate: (() => void) | null;
  map: MapLibreMap | null;
  quests: Quest[];
  walkMinutes: Record<string, number>;
  now: Date;
  onSelect: (id: string) => void;
};

const PILL = 'oh-press flex h-12 min-w-0 items-center justify-center gap-2 rounded-full transition-[flex-grow,background-color,color] duration-200 ease-out motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fb-blue';
const pillClass = (on: boolean) => cn(PILL, on ? 'min-w-fit grow-[2.2] bg-fb-blue px-5 text-white' : 'grow bg-fb-blue-tint text-fb-blue hover:brightness-95');
const FLOAT = 'oh-press inline-flex h-12 items-center gap-2 rounded-full bg-fb-surface px-4 text-[15px] font-semibold text-fb-text shadow-popover hover:bg-fb-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-fb-blue';

export function OutHereDock({ mode, onMode, view, onToggleView, onCreate, map, quests, walkMinutes, now, onSelect }: Props) {
  const drag = useSheetDrag({ onClose: () => {}, initial: 'half' });
  const open = drag.snap === 'full';
  const fold = () => drag.setSnap('half');

  return (
    <div
      data-testid="out-here-dock"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col md:inset-x-auto md:bottom-4 md:left-1/2 md:w-[440px] md:-translate-x-1/2"
    >
      {/* Actions above the sheet */}
      <div className="pointer-events-auto mb-3 flex items-center gap-2 px-3 md:px-0">
        <ImFreeButton />
        {mode === 'friends' ? (
          <PeopleButton map={map} className={FLOAT} />
        ) : onCreate && (
          <button type="button" data-testid="create-plan-btn" aria-label="Post a plan" title="Post a plan (or long-press the map)" onClick={onCreate} className={FLOAT}>
            <Plus size={20} className="text-fb-blue" aria-hidden />
            Post
          </button>
        )}
        <span className="flex-1" />
        {onToggleView && (
          <button
            type="button"
            data-testid={view === '3d' ? 'view-map' : 'view-3d'}
            aria-label={view === '3d' ? 'Switch to the map view' : 'Switch to the 3D view'}
            title={view === '3d' ? 'Map view' : '3D view'}
            onClick={onToggleView}
            className="oh-press flex size-12 items-center justify-center rounded-full bg-fb-surface text-[15px] font-bold text-fb-text shadow-popover hover:bg-fb-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-fb-blue"
          >
            {view === '3d' ? <MapIcon size={20} aria-hidden /> : '3D'}
          </button>
        )}
      </div>

      {/* The sheet */}
      <section
        aria-label="Out Here"
        style={drag.sheetStyle}
        className="pointer-events-auto flex max-h-[62vh] flex-col rounded-t-[20px] bg-fb-surface shadow-popover md:rounded-[20px]"
      >
        <button {...drag.handleProps} aria-label={open ? 'Hide the list of plans' : 'Show the plans as a list'} data-testid="dock-handle"
          className="flex h-6 w-full shrink-0 touch-none items-center justify-center rounded-t-[20px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-fb-blue">
          <span aria-hidden className="h-1 w-10 rounded-full bg-fb-divider" />
        </button>

        <nav aria-label="Out Here" className="flex shrink-0 gap-2 px-3 pb-3">
          <button type="button" data-testid="map-mode-explore" aria-pressed={mode === 'explore'} aria-label="Explore" onClick={() => onMode('explore')} className={pillClass(mode === 'explore')}>
            <MapPin size={22} aria-hidden />
            {mode === 'explore' && <span aria-hidden className="whitespace-nowrap text-[15px] font-semibold">Explore</span>}
          </button>
          <button type="button" data-testid="map-mode-friends" aria-pressed={mode === 'friends'} aria-label="Friends" onClick={() => onMode('friends')} className={pillClass(mode === 'friends')}>
            <Users size={22} aria-hidden />
            {mode === 'friends' && <span aria-hidden className="whitespace-nowrap text-[15px] font-semibold">Friends</span>}
          </button>
          <Link href="/events?tab=going" aria-label="Your plans" title="Your plans" className={pillClass(false)}>
            <CalendarCheck size={22} aria-hidden />
          </Link>
          <Link href="/memories" aria-label="Memories" title="Memories" className={pillClass(false)}>
            <Images size={22} aria-hidden />
          </Link>
        </nav>

        {open && (
          <div className="min-h-0 overflow-y-auto overscroll-contain border-t border-fb-divider px-2 pb-3 pt-2" data-testid="dock-list">
            <p className="px-2 pb-1 text-[13px] font-semibold text-fb-text-2">
              {quests.length === 0 ? 'No plans on the map right now' : mode === 'friends' ? `Plans your friends joined · ${quests.length}` : `Plans on the map · ${quests.length}`}
            </p>
            <ul>
              {quests.map((q) => {
                const walk = walkLabel(walkMinutes[q.id]);
                return (
                  <li key={q.id}>
                    <button type="button" onClick={() => { fold(); onSelect(q.id); }} className="flex w-full items-center gap-3 rounded-btn p-2 text-left hover:bg-fb-hover">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fb-input text-[22px]" aria-hidden>{q.emoji}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-fb-body font-semibold text-fb-text">{q.title}</span>
                        <span className="block truncate text-fb-meta text-fb-text-2">{q.venueName} · {startsLabel(q, now)}{walk ? ` · ${walk}` : ''}</span>
                      </span>
                      <span className="shrink-0 rounded-pill bg-fb-blue-tint px-2 py-0.5 text-[12px] font-semibold text-fb-blue">{seatBadge(seatsLeftOf(q))}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
