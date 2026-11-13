'use client';
// Find My-style People list: friends sharing with you, nearest first. Tapping a row opens their
// card and flies the map to a nearby friend (a friend in another city opens in place). The top row is your own sharing, with an Edit button.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { Users } from 'lucide-react';
import { useState } from 'react';
import { useViewer } from '@/features/data';
import { Avatar, Button, EmptyState, Sheet, Skeleton } from '@/features/ui';
import type { FriendPin } from '@/shared/types';
import { SharingSheet, audienceLabel } from './SharingSheet';
import { distanceLine, floatingPanel, panelPadding, updatedAgo, useFriendPins, useMyShare } from './useFindMy';

/** Opens the friend's card; FriendsLayer flies the map to a nearby friend, clear of the card (a far one opens in place). */
export function flyToPin(_map: MapLibreMap | null | undefined, pin: FriendPin) {
  const zoom = pin.precision === 'approximate' ? 14 : 16;
  window.dispatchEvent(new CustomEvent('findmy:open', { detail: { id: pin.friend.id, zoom } }));
}

export function PeopleSheet({ open, onClose, map }: { open: boolean; onClose: () => void; map?: MapLibreMap | null }) {
  const { data, loading, error } = useFriendPins();
  const { data: mine } = useMyShare();
  const { viewer } = useViewer();
  const [editing, setEditing] = useState(false);
  const pins = data?.pins ?? [];
  const share = mine?.share ?? null;
  return (
    <>
      <Sheet open={open && !editing} onClose={() => { onClose(); map?.easeTo({ padding: panelPadding(null), duration: 300 }); }} title="People" side="left" className={floatingPanel('left')}>
        <div className="flex items-center gap-3 rounded-card py-2" data-testid="my-sharing-row">
          <Avatar src={viewer.avatarUrl} name={viewer.name} size={48} decorative />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">You</p>
            <p className="truncate text-[13px] text-fb-text-2">
              {share
                ? share.paused ? 'Location sharing paused' : `${audienceLabel(share.audience)} · ${share.precision === 'exact' ? 'Exact' : 'Approximate'}`
                : 'Not sharing your location'}
            </p>
            {share?.bubble.thought && (
              <p className="truncate text-[13px] text-fb-text">{share.bubble.emoji && <span className="mr-1 text-[15px] leading-none" aria-hidden>{share.bubble.emoji}</span>}{share.bubble.thought}</p>
            )}
          </div>
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
        </div>
        <div className="my-2 h-px bg-fb-divider-soft" />
        <h3 className="py-1 text-[17px] font-semibold">Friends sharing with you</h3>
        {loading && !data && (
          <div className="flex flex-col gap-3 py-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3"><Skeleton shape="circle" width={48} height={48} /><Skeleton width="60%" className="h-4" /></div>
            ))}
          </div>
        )}
        {error && <p role="alert" className="py-2 text-[15px] text-fb-red">Couldn&apos;t load friends. {error}</p>}
        {data && pins.length === 0 && (
          <EmptyState icon={<Users size={28} aria-hidden />} title="No friends are sharing right now" body="When friends share their location with you, they show up here." />
        )}
        <ul className="flex flex-col" data-testid="people-list">
          {pins.map((p) => (
            <li key={p.friend.id}>
              <button
                type="button"
                data-testid="people-row"
                data-handle={p.friend.handle}
                onClick={() => { onClose(); flyToPin(map, p); }}
                className="flex w-full items-center gap-3 rounded-btn px-1 py-2 text-left hover:bg-fb-hover"
              >
                <span className="rounded-full ring-2 ring-fb-green"><Avatar src={p.friend.avatarUrl} name={p.friend.name} size={48} decorative /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{p.friend.name}</span>
                  {p.bubble.thought && (
                    <span className="block truncate text-[13px] text-fb-text">{p.bubble.emoji && <span className="mr-1 text-[15px] leading-none" aria-hidden>{p.bubble.emoji}</span>}{p.bubble.thought}</span>
                  )}
                  <span className="block truncate text-[13px] text-fb-text-2">{p.placeLabel ?? 'Nearby'} · {updatedAgo(p.updatedAt)}</span>
                </span>
                <span className="shrink-0 text-right text-[13px] text-fb-text-2">{distanceLine(p).split(' · ')[0].replace(' away', '')}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
      <SharingSheet open={open && editing} onClose={() => setEditing(false)} />
    </>
  );
}

/** Map overlay button that opens the People sheet. */
export function PeopleButton({ map }: { map?: MapLibreMap | null }) {
  const [open, setOpen] = useState(false);
  const { data } = useFriendPins();
  const count = data?.pins.length ?? 0;
  return (
    <>
      <button
        type="button"
        aria-label={count > 0 ? `People, ${count}` : 'People'}
        onClick={() => {
          setOpen(true);
          // keep pins clear of the desktop People panel
          if (map && window.matchMedia('(min-width: 768px)').matches) map.easeTo({ padding: panelPadding('left'), duration: 300 });
        }}
        className="flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[15px] font-semibold text-fb-text shadow-popover hover:bg-[#F2F4F7]"
      >
        <Users size={18} aria-hidden />
        {/* phones: the icon and count only, so the row fits beside the Map / 3D toggle */}
        <span className="max-md:sr-only">People</span>
        {count > 0 && <span className="rounded-full bg-fb-blue-tint px-1.5 text-[13px] text-fb-blue">{count}</span>}
      </button>
      <PeopleSheet open={open} onClose={() => setOpen(false)} map={map} />
    </>
  );
}
