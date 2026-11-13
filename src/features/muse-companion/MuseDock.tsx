'use client';
// The one Muse button: Jolly. On Out Here he sits in the map's control row (beside Back to you and
// Map/3D), the same size as the buttons around him, and hovers gently. Pages without that row
// (Memories) get the floating version at the side. Both:
//  - open the Muse chat,
//  - catch Jolly flying out of the 3D world when you leave it (he lands here),
//  - show Muse speaking up (a friend just got free) in a card that pops out of him,
//  - and, everywhere but the 3D world (where Jolly talks in the street), Jolly's speech bubble (a
//    hello, or the plan that's up next) and his thought clouds (Muse's live commentary) pop out of him.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useViewer } from '@/features/data';
import { useUpNext } from '@/features/outhere';
import { useMuseCommentary } from './commentary';
import { backendTransport } from '@/features/muse-encounters';
import { usePlanOpen } from '@/features/outhere/plan-state';
import { cn } from '@/features/ui';
import {
  dismissMuseNudge, openChat, registerMuseDockSlot, sendAgentMessage, takeMuseDockFrom, useMuseInWorld, useMuseNudge, useMuseSnapshot,
} from './controller';
import { MuseOrb } from './MuseOrb';

let greeting = { text: '', until: 0, key: '' };

/** What Muse says when you open a page: a short line on what it is and what Muse does there. */
export function pageIntro(path: string, first: string): string | null {
  if (path === '/' ) return `Your Feed, ${first}: what friends and groups are up to. Tap I’m free and I’ll turn it into a plan.`;
  if (path.startsWith('/out-here')) return `Out Here: live plans near you. Tell me you’re free and I’ll find one that fits.`;
  if (path.startsWith('/memories')) return 'Memories: photos from your hangouts. I can plan the next one with the same crew.';
  if (path.startsWith('/friends')) return 'Friends: requests and suggestions. I use who you know to find plans you’ll like.';
  if (path.startsWith('/groups')) return 'Groups: your communities. Each one’s Hangouts tab shows plans its members can join.';
  if (path.startsWith('/marketplace')) return 'Marketplace: things for sale nearby. I can pick finds that match what you’re into.';
  if (path.startsWith('/messages')) return 'Messenger: your chats. Invites I draft for you land here too.';
  if (path.startsWith('/notifications')) return 'Notifications: invites, joins and replies, all in one place.';
  if (path.startsWith('/events')) return 'Events: what’s on. I can find friends who are going.';
  if (path.startsWith('/profile')) return 'A profile: their posts, photos and friends.';
  if (path.startsWith('/search')) return 'Search people, groups, events and plans.';
  if (path.startsWith('/watch')) return 'Watch: short videos. What you like helps me suggest plans.';
  if (path.startsWith('/saved')) return 'Saved: things you kept for later.';
  if (path.startsWith('/menu')) return 'Menu: everything in one place.';
  return null;
}
/** And when you switch section inside Out Here. */
const SECTION: Record<string, string> = {
  friends: 'Friends: who’s sharing where they are, and what they’re up for.',
  explore: 'Explore: open plans on the map. The badge shows how many spots are left.',
  plans: 'Your plans: what you’ve joined, and when to leave.',
};

export function MuseDockButton({ variant }: { variant: 'row' | 'floating' }) {
  const snap = useMuseSnapshot();
  const planOpen = usePlanOpen();
  const inWorld = useMuseInWorld();
  const nudge = useMuseNudge();
  const ref = useRef<HTMLButtonElement>(null);
  const row = variant === 'row';
  const { viewer } = useViewer();
  const upNext = useUpNext();
  const commentary = useMuseCommentary();

  // Opening a page (or an Out Here section), Muse says what it is, in a speech bubble from Jolly.
  // Shared by both Jollys (the floating one can mount a moment before the row's), so whichever is
  // showing says it. On Out Here with a plan coming up, the plan comes first.
  const pathname = usePathname() ?? '/';
  const [hello, setHello] = useState<string | null>(null);
  const [section, setSection] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => setSection(String((e as CustomEvent<string>).detail));
    window.addEventListener('muse:section', on);
    return () => window.removeEventListener('muse:section', on);
  }, []);
  useEffect(() => { setSection(null); }, [pathname]);
  useEffect(() => {
    if (inWorld) { setHello(null); return; }
    const key = `${viewer.id}|${pathname}|${section ?? ''}`;
    if (greeting.key !== key) {
      const first = viewer.name.split(' ')[0];
      const mins = upNext ? Math.round((Date.parse(upNext.quest.startsAt) - Date.now()) / 60_000) : 0;
      const text = section ? SECTION[section] ?? null
        : pathname.startsWith('/out-here') && upNext ? `${upNext.quest.title} ${mins <= 0 ? 'is happening now' : `starts in ${mins} min`}. Tap Let’s go and we’ll walk there.`
          : pageIntro(pathname, first);
      greeting = { text: text ?? '', until: text ? Date.now() + 6000 : 0, key };
    }
    const left = greeting.until - Date.now();
    if (left <= 0 || !greeting.text) { setHello(null); return; }
    setHello(greeting.text);
    const t = window.setTimeout(() => setHello(null), left);
    return () => window.clearTimeout(t);
  }, [inWorld, viewer.id, pathname, section]); // eslint-disable-line react-hooks/exhaustive-deps

  // The row's Jolly replaces the floating one while it is on screen.
  useEffect(() => (row ? registerMuseDockSlot() : undefined), [row]);

  // Leaving 3D: he flies from his last spot in the world to here (up toward you, then across).
  useLayoutEffect(() => {
    if (inWorld) return;
    const from = takeMuseDockFrom();
    const el = ref.current;
    if (!from || !el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    const dx = from.x - (r.left + r.width / 2), dy = from.y - (r.top + r.height / 2);
    el.classList.add('muse-dock-flying');
    const a = el.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(.55)`, opacity: 0.2 },
      { transform: `translate(${dx * 0.6}px, ${dy * 0.6 - 110}px) scale(1.9)`, opacity: 1, offset: 0.42 },
      { transform: `translate(${dx * 0.15}px, ${dy * 0.15 - 30}px) scale(1.15)`, offset: 0.8 },
      { transform: 'translate(0, 0) scale(1)' },
    ], { duration: 1250, easing: 'cubic-bezier(.33,.7,.3,1)' });
    a.onfinish = a.oncancel = () => el.classList.remove('muse-dock-flying');
    return () => a.cancel();
  }, [inWorld]);

  // A nudge stays for a minute, or until acted on.
  useEffect(() => {
    if (!nudge) return;
    const t = window.setTimeout(() => dismissMuseNudge(nudge.id), 60_000);
    return () => window.clearTimeout(t);
  }, [nudge]);
  const askFromNudge = useCallback(() => {
    if (!nudge) return;
    dismissMuseNudge(nudge.id);
    openChat();
    sendAgentMessage(nudge.ask, nudge.friend, backendTransport);
  }, [nudge]);

  // Closing the chat hands focus back to Jolly, so keyboard users are not dropped.
  const wasOpen = useRef(snap.open);
  useEffect(() => { if (wasOpen.current && !snap.open) ref.current?.focus({ preventScroll: true }); wasOpen.current = snap.open; }, [snap.open]);

  // The floating one steps aside while the chat or the "I'm free" sheet is up; the row's stays put.
  if (!row && (snap.open || planOpen)) return null;
  const showNudge = !!nudge && !snap.open && !planOpen;
  // Not in 3D (Jolly speaks in the street there). The nudge card wins; then thoughts; then hello.
  const thought = !inWorld && !showNudge && commentary.open ? commentary.current?.text ?? null : null;
  const speech = !inWorld && !showNudge && !thought && !snap.open && !planOpen ? hello : null;
  const above = row ? 'bottom-full right-0 mb-3' : 'bottom-full right-0 mb-4';

  return (
    <div className={cn(row ? 'relative shrink-0' : 'fixed bottom-[136px] right-3 z-30 max-md:bottom-[318px]')}>
      <button
        ref={ref}
        type="button"
        data-testid="muse-launcher"
        data-docked="true"
        data-variant={variant}
        data-nudge={showNudge ? 'true' : undefined}
        aria-label="Ask Muse"
        aria-expanded={snap.open}
        title="Ask Muse"
        onClick={() => openChat()}
        className={cn('muse-dock group relative flex items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fb-blue',
          row ? 'muse-dock-row size-11 bg-fb-surface shadow-popover' : 'size-[60px]')}
      >
        {!row && <span aria-hidden className="muse-dock-shadow" />}
        <span className="muse-dock-float">
          <span aria-hidden className="muse-dock-glow" />
          <MuseOrb state={snap.state} size={row ? 40 : 50} className={cn('rounded-full', !row && 'shadow-popover')} />
          <span aria-hidden className="muse-dock-spark" />
        </span>
        {!row && (
          // Desktop: a small "Ask Muse" tag beside him. Phones: just Jolly.
          <span className="muse-dock-tag pointer-events-none absolute right-full top-1/2 mr-1.5 -translate-y-1/2 whitespace-nowrap rounded-pill bg-fb-surface px-3 py-1.5 text-[14px] font-semibold text-fb-text shadow-card transition-transform group-hover:-translate-x-0.5 max-md:sr-only">Ask Muse</span>
        )}
      </button>
      {thought && (
        // Muse's live commentary as a thought cloud, joined to Jolly by two dots.
        <div key={`t:${commentary.key}`} data-testid="muse-dock-thought" aria-hidden className={cn('pointer-events-none absolute z-30', above)}>
          <span className="muse-dock-cloud">{thought}</span>
          <i className="muse-dock-cloud-dot" style={{ right: 26, bottom: -9, width: 9, height: 9 }} />
          <i className="muse-dock-cloud-dot" style={{ right: 18, bottom: -17, width: 6, height: 6 }} />
        </div>
      )}
      {speech && (
        <button type="button" key={speech} data-testid="muse-dock-speech" onClick={() => openChat()}
          className={cn('muse-dock-speech absolute z-30 text-left', above)}>
          <span className="mb-0.5 flex items-center gap-1 text-[12px] font-bold text-fb-blue"><span aria-hidden>✨</span>Muse</span>
          {speech}
        </button>
      )}
      {showNudge && (
        // Muse speaking up, from a real event (a friend just shared that they're free).
        <div key={nudge.id} role="status" data-testid="muse-nudge"
          className={cn('muse-nudge absolute z-30 w-[248px] rounded-card bg-fb-surface p-3 text-left shadow-popover max-md:w-[228px]',
            row ? 'muse-nudge-up bottom-full right-0 mb-3' : 'bottom-0 right-full mr-6')}>
          <p className="flex items-center gap-1 text-[12px] font-bold text-fb-blue"><span aria-hidden>✨</span>Muse</p>
          <p className="mt-0.5 text-[15px] font-semibold leading-5 text-fb-text">{nudge.title}</p>
          <p className="text-[13px] leading-[18px] text-fb-text-2">{nudge.detail}</p>
          {nudge.quote && <p className="mt-1 truncate text-[13px] italic leading-[18px] text-fb-text">“{nudge.quote}”</p>}
          <div className="mt-2 flex gap-2">
            <button type="button" data-testid="muse-nudge-ask" onClick={askFromNudge} className="oh-press flex-1 rounded-[6px] bg-fb-blue px-2 py-1.5 text-[14px] font-semibold text-white hover:brightness-95">{nudge.action}</button>
            <button type="button" data-testid="muse-nudge-dismiss" onClick={() => dismissMuseNudge(nudge.id)} className="rounded-[6px] bg-fb-hover px-2.5 py-1.5 text-[14px] font-semibold text-fb-text">Not now</button>
          </div>
          <span aria-hidden className={cn('absolute size-3 rotate-45 bg-fb-surface', row ? '-bottom-1.5 right-4' : '-right-1.5 bottom-6')} />
        </div>
      )}
    </div>
  );
}
