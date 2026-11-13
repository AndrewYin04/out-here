'use client';
// "Maya just got free": when a friend shares a new "I'm free" while you're on the map (it arrives
// live: posting availability tells each friend who can see it), Muse speaks up from its dock with
// what it knows and offers to ask their Muse. Signals already there when the map loaded never
// count as "just": only ones that appear while you're watching.
import { useEffect, useRef } from 'react';
import { showMuseNudge } from '@/features/muse-companion';
import { formatDemoTime, type FriendPin } from '@/shared';

/** Starts now or within 15 min, and has not ended. */
const activeSoon = (p: FriendPin, now: number) => !!p.availability && Date.parse(p.availability.endsAt) > now && Date.parse(p.availability.startsAt) <= now + 15 * 60_000;

export function useFreeFriendNudge(pins: FriendPin[] | null): void {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!pins) return;
    const now = Date.now();
    const active = pins.filter((p) => activeSoon(p, now));
    if (seen.current === null) { seen.current = new Set(active.map((p) => p.availability!.id)); return; }
    const known = seen.current;
    const fresh = active.filter((p) => !known.has(p.availability!.id));
    for (const p of active) known.add(p.availability!.id);
    const p = fresh.sort((a, b) => (a.walkingMinutes ?? 999) - (b.walkingMinutes ?? 999))[0];
    if (!p?.availability) return;
    const first = p.friend.name.split(' ')[0];
    const until = formatDemoTime(p.availability.endsAt);
    const where = p.walkingMinutes !== null ? `${p.walkingMinutes} min walk` : p.placeLabel;
    showMuseNudge({
      id: p.availability.id,
      title: `${first} just got free`,
      detail: [where, `till ${until}`].filter(Boolean).join(' · '),
      quote: p.availability.text.trim().slice(0, 60) || null,
      friend: { id: p.friend.id, name: p.friend.name },
      ask: `Is ${first} free to do something nearby before ${until}?`,
      action: `Ask ${first}’s Muse`,
    });
  }, [pins]);
}
