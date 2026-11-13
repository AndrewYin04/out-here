'use client';
// Muse at work on the 2D map, while the Muse chat is open. Jolly leaves his dock and hops to
// whatever his current thought is about, with the thought in a cloud over him:
//  - "Got it: food · 45 min": he is beside you
//  - "Maya and Liam are free": rings light up on those friends
//  - "Checked 18 plans": the plans still in the running glow, the dropped ones get a grey tag
//    ("too far", "over budget") from the planner's own reasons
//  - the pick, its reason and bridge line: he sits on that plan, its ring glows
// Asking a friend's Muse, their Muse appears over their pin, and every real message sent or
// received flies between the two as an orb. Everything comes from useMuseCommentary (real events
// only). It draws its own rings at map coordinates, so it works in Explore and Friends alike.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { MuseOrb, attachMuseWorld, finishAgentEncounter, useAgentEncounter, useMuseCommentary, useMuseSnapshot, type ThoughtFocus } from '@/features/muse-companion';
import type { FriendPin, LatLng, Quest } from '@/shared';

type Pt = { x: number; y: number };
// The dots from Jolly's head up to the cloud: x, y (px from his centre) and size.
const DOTS: [number, number, number][] = [[9, -27, 6], [13, -37, 9]];

function useMapTick(map: MapLibreMap, on: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const bump = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setTick((t) => t + 1)); };
    map.on('move', bump); map.on('resize', bump);
    return () => { cancelAnimationFrame(raf); map.off('move', bump); map.off('resize', bump); };
  }, [map, on]);
  return tick;
}

export function MuseMapLayer({ map, me, quests, friendPins }: { map: MapLibreMap; me: LatLng; quests: Quest[]; friendPins: FriendPin[] }) {
  const c = useMuseCommentary();
  const snap = useMuseSnapshot();
  const encounter = useAgentEncounter();
  const on = c.open && (!!c.current || !!encounter);
  useMapTick(map, on);
  // The map shows hand-offs: a finished one stays on screen a few seconds (so you see how it went),
  // then makes way for the reply's commentary.
  useEffect(() => attachMuseWorld('map'), []);
  const done = encounter?.outcome ? encounter.id : null;
  useEffect(() => {
    if (done === null) return;
    const t = window.setTimeout(() => finishAgentEncounter(done), 4500);
    return () => window.clearTimeout(t);
  }, [done]);
  if (!on) return null;

  const box = map.getContainer().getBoundingClientRect();
  const phone = box.width < 768;
  const project = (p: LatLng): Pt => { const s = map.project([p.lng, p.lat]); return { x: s.x, y: s.y }; };
  const questOf = (id: string) => quests.find((q) => q.id === id) ?? null;
  const friendAt = (id: string) => friendPins.find((p) => p.friend.id === id) ?? null;
  // Keep Jolly where you can see him: off the chat (a card bottom right on desktop, a sheet on phones).
  const clamp = (p: Pt): Pt => ({
    x: Math.min(Math.max(p.x, 110), box.width - (phone ? 110 : 430)),
    y: Math.min(Math.max(p.y, 170), box.height * (phone ? 0.5 : 1) - (phone ? 40 : 150)),
  });

  const focus: ThoughtFocus | null = c.current?.focus ?? (encounter ? { kind: 'encounter', friendId: encounter.recipient.id } : null);
  const mePt = project(me);
  const rings: { key: string; at: Pt; tone: 'lit' | 'friend'; emoji?: string }[] = [];
  const tags: { key: string; at: Pt; text: string }[] = [];
  let jolly: Pt = mePt;
  if (focus?.kind === 'friends') {
    for (const id of focus.ids) { const f = friendAt(id); if (f) rings.push({ key: `f:${id}`, at: project(f.location), tone: 'friend' }); }
    if (rings[0]) jolly = rings[0].at;
  } else if (focus?.kind === 'checked') {
    for (const id of focus.lit) { const q = questOf(id); if (q) rings.push({ key: `q:${id}`, at: project(q.location), tone: 'lit', emoji: q.emoji }); }
    for (const d of focus.dropped.slice(0, 8)) { const q = questOf(d.id); if (q) tags.push({ key: `d:${d.id}`, at: project(q.location), text: `${q.emoji} ${d.label}` }); }
  } else if (focus?.kind === 'quest') {
    const q = questOf(focus.id);
    if (q) { const at = project(q.location); rings.push({ key: `q:${focus.id}`, at, tone: 'lit', emoji: q.emoji }); jolly = at; }
    for (const id of focus.friendIds) { const f = friendAt(id); if (f) rings.push({ key: `f:${id}`, at: project(f.location), tone: 'friend' }); }
  }
  // Jolly perches up and to the left of his target, so the pin itself stays visible.
  const perch = clamp({ x: jolly.x - 44, y: jolly.y - 68 });
  const text = c.current?.text ?? null;

  return (
    <div aria-hidden data-testid="muse-map-layer" data-focus={focus?.kind ?? 'none'} className="pointer-events-none absolute inset-0 z-[12] overflow-hidden">
      {rings.map((r) => (
        <span key={r.key} data-testid="muse-map-ring" className={`muse-map-ring muse-map-ring-${r.tone}`} style={{ left: r.at.x, top: r.at.y }}>{r.emoji && <b className="muse-map-ring-emoji">{r.emoji}</b>}</span>
      ))}
      {tags.map((t) => (
        <span key={t.key} data-testid="muse-map-drop" className="muse-map-drop" style={{ left: t.at.x, top: t.at.y }}>{t.text}</span>
      ))}
      {encounter && focus?.kind === 'encounter' && (
        <MuseHandoff me={clamp(mePt)} friend={friendAt(encounter.recipient.id)} project={project} clamp={clamp}
          name={encounter.recipient.name.split(' ')[0]} messages={encounter.messages} outcome={encounter.outcome} />
      )}
      {focus?.kind !== 'encounter' && (
        <div className="muse-map-jolly" style={{ transform: `translate(${perch.x}px, ${perch.y}px)` }}>
          <span key={`j:${c.key}`} className="muse-map-hop"><MuseOrb state={snap.state} size={44} className="rounded-full shadow-popover" /></span>
          {text && <ThoughtCloud key={`t:${c.key}`} text={text} />}
        </div>
      )}
    </div>
  );
}

/** A thought cloud over Jolly on the map (it grows upward), joined to his head by a trail of dots. */
function ThoughtCloud({ text }: { text: string }) {
  return (
    <>
      {DOTS.map(([x, y, px], k) => (
        <i key={k} className="muse-thought-dot" style={{ left: x, top: y, width: px, height: px, animationDelay: `${k * 0.08}s` }} />
      ))}
      <span className="muse-map-cloud"><span data-testid="muse-map-thought" className="muse-thought muse-map-thought">{text}</span></span>
    </>
  );
}

/** Your Muse and your friend's Muse, with each real message flying between them. */
function MuseHandoff({ me, friend, project, clamp, name, messages, outcome }: {
  me: Pt; friend: FriendPin | null; project: (p: LatLng) => Pt; clamp: (p: Pt) => Pt; name: string;
  messages: ('sent' | 'received')[]; outcome: string | null;
}) {
  // Without a shared location, their Muse waits up and to the right of yours.
  const them = friend ? clamp({ x: project(friend.location).x, y: project(friend.location).y - 58 }) : clamp({ x: me.x + 150, y: me.y - 120 });
  const mine = { x: me.x - 30, y: me.y - 58 };
  const seen = useRef(messages.length);
  const [flights, setFlights] = useState<{ id: number; dir: 'sent' | 'received'; delay: number }[]>([]);
  useLayoutEffect(() => {
    if (messages.length > seen.current) {
      const fresh = messages.slice(seen.current).map((dir, i) => ({ id: seen.current + i, dir, delay: i * 0.7 }));
      setFlights((f) => [...f, ...fresh].slice(-4));
    }
    seen.current = messages.length;
  }, [messages]);
  const status = outcome === 'success' ? 'replied' : outcome === 'unavailable' || outcome === 'no_response' ? 'no time confirmed' : outcome ? null : messages.at(-1) === 'sent' ? 'reading…' : 'checking…';
  const dx = them.x - mine.x, dy = them.y - mine.y;
  return (
    <>
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <path d={`M ${mine.x} ${mine.y} Q ${(mine.x + them.x) / 2} ${Math.min(mine.y, them.y) - 70} ${them.x} ${them.y}`} className="muse-map-link" />
      </svg>
      <div className="muse-map-jolly" style={{ transform: `translate(${mine.x}px, ${mine.y}px)` }}>
        <span className="muse-map-hop"><MuseOrb state="sending" size={44} className="rounded-full shadow-popover" /></span>
        <span className="muse-map-name">Your Muse</span>
      </div>
      <div data-testid="muse-map-friend-muse" className="muse-map-jolly" style={{ transform: `translate(${them.x}px, ${them.y}px)` }}>
        <span className="muse-map-hop muse-map-other"><MuseOrb state={outcome ? 'idle' : 'thinking'} size={44} className="rounded-full shadow-popover" /></span>
        <span className="muse-map-name">{name}’s Muse{status && <em> · {status}</em>}</span>
      </div>
      {flights.map((f) => (
        <i key={f.id} data-testid="muse-map-message" className="muse-map-orb"
          onAnimationEnd={() => setFlights((all) => all.filter((x) => x.id !== f.id))}
          style={{ animationDelay: `${f.delay}s`, left: f.dir === 'sent' ? mine.x : them.x, top: f.dir === 'sent' ? mine.y : them.y, ['--dx' as string]: `${f.dir === 'sent' ? dx : -dx}px`, ['--dy' as string]: `${f.dir === 'sent' ? dy : -dy}px` } as CSSProperties} />
      ))}
    </>
  );
}
