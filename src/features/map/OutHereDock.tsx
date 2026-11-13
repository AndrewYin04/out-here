'use client';
// The Out Here dashboard (Life360-style, docs/OUTHERE_DASHBOARD.md): one panel at the bottom of
// the map holds Out Here's navigation and lists, so nothing else needs to float over the map.
//  - Above the panel: I'm free (the primary action), Post in Explore, then Back to you and 3D/Map.
//  - The panel: a handle and one row of tabs. The selected tab shows its icon and label; the
//    others show only their icon and keep their names for screen readers.
//      Friends  friends' locations on the map, and the People list (the default)
//      Explore  the plans on the map (the pins), as a list
//      Plans    the plans you joined and your past hangouts (Your plans)
//      Memories opens the Memories page
//  - Three heights: peek (tabs only, the default), half (the tab's list) and full. Drag or tap the
//    handle, or use the keyboard (Enter toggles, ArrowUp/ArrowDown step, Escape folds).
import { CalendarCheck, Images, LocateFixed, Map as MapIcon, MapPin, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { PeopleList, SharingSheet, flyToPin, useFriendPins } from '@/features/map/friends';
import { YourPlans } from '@/features/memories';
import { setMuseViewport } from '@/features/muse-companion';
import { ImFreeButton } from '@/features/outhere';
import { CategoryIcon, cn } from '@/features/ui';
import type { Quest } from '@/shared';
import { seatBadge, seatsLeftOf, startsLabel, walkLabel } from './format';
import type { MapMode } from './types';

export type DockTab = MapMode | 'plans';
type Level = 0 | 1 | 2;

/** Opens the dashboard on a tab from anywhere in Out Here (for example "Your plans" in a card). */
export const OPEN_DOCK = 'outhere:dock';
export function openDock(tab: DockTab) {
  window.dispatchEvent(new CustomEvent(OPEN_DOCK, { detail: tab }));
}

type Props = {
  mode: MapMode;
  onMode: (m: MapMode) => void;
  view: 'map' | '3d';
  onToggleView: (() => void) | null;
  onRecenter: () => void;
  onCreate: (() => void) | null;
  quests: Quest[];
  walkMinutes: Record<string, number>;
  now: Date;
  onSelect: (id: string) => void;
  /** The I'm free row hides while you walk; the tabs stay. */
  showActions?: boolean;
};

const SNAP_PX = 48;
const FLICK = 0.5;

const TAB = 'oh-press flex h-11 min-w-0 items-center justify-center gap-2 rounded-full transition-[flex-grow,background-color,color] duration-500 ease-in-out motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fb-blue';
const tabClass = (on: boolean) => cn(TAB, on ? 'min-w-fit grow-[2.4] bg-fb-blue-tint px-4 text-fb-blue' : 'grow text-fb-text-2 hover:bg-fb-hover');
const ROUND = 'oh-press flex size-11 items-center justify-center rounded-full bg-fb-surface text-fb-text shadow-popover hover:bg-fb-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-fb-blue';

export function OutHereDock({ mode, onMode, view, onToggleView, onRecenter, onCreate, quests, walkMinutes, now, onSelect, showActions = true }: Props) {
  const [tab, setTab] = useState<DockTab>(mode);
  const [level, setLevel] = useState<Level>(0);
  const [editing, setEditing] = useState(false);
  const { data: friendData } = useFriendPins();
  const friendCount = friendData?.pins.length ?? 0;
  // The map mode can change from outside (a friend tapped in 3D, ?mode=friends): follow it.
  useEffect(() => { setTab((t) => (t === 'plans' ? t : mode)); }, [mode]);

  const tabRef = useRef(tab);
  tabRef.current = tab;
  const choose = useCallback((t: DockTab) => {
    if (t !== 'plans') onMode(t);
    // Tapping the open tab again folds or unfolds its list; a new tab keeps the panel's height,
    // except Plans, which has nothing on the map and so opens its list.
    if (tabRef.current === t) setLevel((l) => (l === 0 ? 1 : 0));
    else if (t === 'plans') setLevel((l) => (l === 0 ? 1 : l));
    tabRef.current = t;
    setTab(t);
  }, [onMode]);

  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<DockTab>).detail;
      if (t !== 'plans') onMode(t);
      tabRef.current = t;
      setTab(t);
      setLevel((l) => (l === 0 ? 1 : l));
    };
    window.addEventListener(OPEN_DOCK, on);
    return () => window.removeEventListener(OPEN_DOCK, on);
  }, [onMode]);

  // Drag the handle: up grows the panel one step, down shrinks it; a quick flick counts. The panel
  // follows the finger down (up is resisted) and only `transform` changes while dragging.
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ y: number; t: number; id: number } | null>(null);
  const samples = useRef<{ y: number; t: number }[]>([]);
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    start.current = { y: e.clientY, t: e.timeStamp, id: e.pointerId };
    samples.current = [{ y: e.clientY, t: e.timeStamp }];
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    samples.current = [...samples.current.slice(-1), { y: e.clientY, t: e.timeStamp }];
    const dy = e.clientY - start.current.y;
    setDragY(dy > 0 ? dy : dy / 4);
  };
  const onPointerEnd = (e: PointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    setDragging(false);
    setDragY(0);
    const dy = e.clientY - s.y;
    if (Math.abs(dy) < 4) { setLevel((l) => (l === 0 ? 1 : 0)); return; }
    const from = samples.current[0];
    const v = (e.clientY - from.y) / Math.max(8, e.timeStamp - from.t);
    if (dy < -SNAP_PX || v < -FLICK) setLevel((l) => (l === 2 ? 2 : ((l + 1) as Level)));
    else if (dy > SNAP_PX || v > FLICK) setLevel((l) => (l === 0 ? 0 : ((l - 1) as Level)));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); setLevel((l) => (l === 2 ? 2 : ((l + 1) as Level))); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setLevel((l) => (l === 0 ? 0 : ((l - 1) as Level))); }
  };
  // Escape folds an open panel (anywhere in it), and focus goes back to the handle.
  const handleRef = useRef<HTMLButtonElement>(null);
  const onPanelKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && level > 0) { e.stopPropagation(); setLevel(0); handleRef.current?.focus(); }
  };

  // Tell the 3D view how much of the screen the dashboard covers (Muse's contract,
  // muse-companion/controller.ts), so the camera keeps Jolly and your avatar above it.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      setMuseViewport({
        level: level === 0 ? 'collapsed' : level === 1 ? 'partial' : 'expanded',
        occlusion: { left: r.left, top: r.top, width: r.width, height: r.height },
      });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    window.addEventListener('resize', report, { passive: true });
    return () => { ro.disconnect(); window.removeEventListener('resize', report); setMuseViewport({ level: 'collapsed', occlusion: null }); };
  }, [level]);

  const pickQuest = (id: string) => { setLevel(0); onSelect(id); };
  const label = tab === 'explore'
    ? quests.length === 0 ? 'No plans on the map right now' : mode === 'friends' ? `Plans your friends joined · ${quests.length}` : `Plans on the map · ${quests.length}`
    : tab === 'friends' ? `Friends sharing with you · ${friendCount}` : 'Your plans';
  const listName = tab === 'explore' ? 'the plans' : tab === 'friends' ? 'People' : 'Your plans';

  return (
    <div
      ref={rootRef}
      data-testid="out-here-dock"
      data-level={level}
      data-tab={tab}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col md:inset-x-auto md:bottom-4 md:left-1/2 md:w-[440px] md:-translate-x-1/2"
    >
      {/* Actions above the panel. They step aside while the list is open. */}
      {showActions && level < 2 && (
        <div className="pointer-events-auto mb-3 flex items-center gap-2 px-3 md:px-0">
          <ImFreeButton className="min-w-0 shrink whitespace-nowrap" />
          {tab === 'explore' && onCreate && (
            <button type="button" data-testid="create-plan-btn" aria-label="Post a plan" title="Post a plan (or long-press the map)" onClick={onCreate}
              className="oh-press inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-fb-surface px-4 text-[15px] font-semibold text-fb-text shadow-popover hover:bg-fb-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-fb-blue max-[419px]:px-3">
              <Plus size={20} className="text-fb-blue" aria-hidden />
              {/* On phones I'm free can show your status ("Free till 1:15 AM"), so Post keeps only its icon there (its name stays for screen readers). */}
              <span className="max-[419px]:sr-only">Post</span>
            </button>
          )}
          <span className="flex-1" />
          <button type="button" data-testid="recenter" aria-label="Back to you" title="Back to you" onClick={onRecenter} className={cn(ROUND, 'shrink-0')}>
            <LocateFixed size={20} aria-hidden />
          </button>
          {onToggleView && (
            <button type="button" data-testid={view === '3d' ? 'view-map' : 'view-3d'}
              aria-label={view === '3d' ? 'Switch to the flat map' : 'Switch to the 3D street view'} title={view === '3d' ? 'Flat map' : '3D street view'}
              onClick={onToggleView} className={cn(ROUND, 'shrink-0 text-[15px] font-bold')}>
              {view === '3d' ? <MapIcon size={20} aria-hidden /> : '3D'}
            </button>
          )}
        </div>
      )}

      <section
        aria-label="Out Here"
        onKeyDown={onPanelKey}
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? 'none' : undefined,
        }}
        className="pointer-events-auto flex flex-col rounded-t-[20px] bg-fb-surface shadow-popover transition-transform duration-200 ease-out motion-reduce:transition-none md:rounded-[20px]"
      >
        <button
          ref={handleRef}
          type="button"
          data-testid="dock-handle"
          aria-expanded={level > 0}
          aria-label={level > 0 ? `Hide ${listName}` : `Show ${listName}`}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}
          onKeyDown={onKeyDown}
          onClick={(e) => { if (e.detail === 0) setLevel((l) => (l === 0 ? 1 : 0)); }}
          className="flex h-6 w-full shrink-0 cursor-grab touch-none items-center justify-center rounded-t-[20px] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fb-blue"
        >
          <span aria-hidden className="h-1 w-10 rounded-full bg-fb-divider" />
        </button>

        <nav aria-label="Out Here" className="flex shrink-0 gap-1 px-3 pb-3">
          <TabButton id="friends" on={tab === 'friends'} label="Friends" icon={<Users size={22} aria-hidden />} onClick={() => choose('friends')} testId="map-mode-friends" />
          <TabButton id="explore" on={tab === 'explore'} label="Explore" icon={<MapPin size={22} aria-hidden />} onClick={() => choose('explore')} testId="map-mode-explore" />
          <TabButton id="plans" on={tab === 'plans'} label="Plans" icon={<CalendarCheck size={22} aria-hidden />} onClick={() => choose('plans')} testId="dock-tab-plans" />
          <Link href="/memories" aria-label="Memories" title="Memories" className={tabClass(false)}>
            <Images size={22} aria-hidden />
          </Link>
        </nav>

        {/* The open tab's list. Folded, it is gone from the tab order and from screen readers. */}
        <div
          data-testid="dock-list"
          inert={level === 0}
          aria-hidden={level === 0}
          className={cn(
            'min-h-0 overflow-y-auto overscroll-contain transition-[max-height] duration-200 ease-out motion-reduce:transition-none',
            level === 0 && 'max-h-0',
            level === 1 && 'max-h-[40dvh] border-t border-fb-divider',
            level === 2 && 'max-h-[calc(100dvh-230px)] border-t border-fb-divider md:max-h-[calc(100dvh-200px)]',
          )}
        >
          {level > 0 && (
            <div className="px-2 pb-3 pt-2">
              <p className="px-2 pb-1 text-[13px] font-semibold text-fb-text-2">{label}</p>
              {tab === 'friends' && quests.length > 0 && (
                <p data-testid="friends-filter-chip" className="px-2 pb-1 text-[13px] text-fb-text-2">Plans your friends joined · {quests.length}</p>
              )}
              {tab === 'explore' && (
                <ul>
                  {quests.map((q) => {
                    const walk = walkLabel(walkMinutes[q.id]);
                    return (
                      <li key={q.id}>
                        <button type="button" data-testid="dock-quest" onClick={() => pickQuest(q.id)} className="flex w-full items-center gap-3 rounded-btn p-2 text-left hover:bg-fb-hover">
                          <CategoryIcon category={q.category} size={40} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-fb-body font-semibold leading-5 text-fb-text">{q.title}</span>
                            <span className="block text-fb-meta text-fb-text-2">{q.venueName} · {startsLabel(q, now)}{walk ? ` · ${walk}` : ''}</span>
                          </span>
                          <span className="shrink-0 rounded-pill bg-fb-input px-2 py-0.5 text-[12px] font-semibold text-fb-text-2">{seatBadge(seatsLeftOf(q))}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {tab === 'friends' && (
                <div className="px-2">
                  <PeopleList onPick={(p) => { setLevel(0); flyToPin(null, p); }} onEdit={() => { setLevel(0); setEditing(true); }} />
                </div>
              )}
              {tab === 'plans' && (
                <div className="px-1" data-testid="dock-plans"><YourPlans /></div>
              )}
            </div>
          )}
        </div>
      </section>
      <SharingSheet open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}

function TabButton({ id, on, label, icon, onClick, testId }: { id: DockTab; on: boolean; label: string; icon: ReactNode; onClick: () => void; testId: string }) {
  return (
    <button type="button" data-testid={testId} data-tab={id} aria-pressed={on} aria-label={label} title={label} onClick={onClick} className={tabClass(on)}>
      {icon}
      {on && <span aria-hidden className="animate-[oh-tab-label_500ms_ease-in-out] whitespace-nowrap text-[15px] font-semibold motion-reduce:animate-none">{label}</span>}
    </button>
  );
}
