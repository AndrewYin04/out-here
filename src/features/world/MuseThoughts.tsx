'use client';
// Blue thought orbs and speech bubbles around Jolly while the Muse chat is open, showing what Muse
// is doing, only from things that are actually known:
//  - the request is in flight (a few orbs circle him, one bubble says so)
//  - a friend hand-off: whose Muse was asked, that the message went out, that a reply came back
//    (the real agent events)
//  - a photo is being looked at
//  - after a plan reply: what Muse worked through, from the reply's own numbers (until your next message)
// It never invents stages or timings. World3D moves it to Jolly's screen position every frame.
import { useRef, type CSSProperties, type RefObject } from 'react';
import { useAgentEncounter, useChatMessages, useMuseSnapshot } from '@/features/muse-companion';
import { museSteps } from '@/features/outhere';
import { cn } from '@/features/ui';

const WORKING = new Set(['thinking', 'evaluating', 'sending', 'receiving', 'delivering']);
// Bubble spots around Jolly, in units of the ring radius (--r): left, right, left, right.
const SLOTS: [number, number][] = [[-1, -1.25], [1, -0.7], [-1, 0.05], [1, 0.65]];

type Bubble = { key: string; text: string };

export function MuseThoughts({ anchorRef }: { anchorRef: RefObject<HTMLDivElement | null> }) {
  const snap = useMuseSnapshot();
  const messages = useChatMessages();
  const encounter = useAgentEncounter();
  const working = snap.open && WORKING.has(snap.state);

  // The latest plan reply: its recap shows for a while after it arrives.
  const last = [...messages].reverse().find((m) => m.role === 'muse' && m.plan);
  // It stays until your next message (the working bubbles replace it) or until the chat closes.
  // Only replies that arrive while this chat is open count (the history is kept between sessions).
  const baseline = useRef<{ open: boolean; id: string | null }>({ open: false, id: null });
  if (snap.open && !baseline.current.open) baseline.current = { open: true, id: last?.id ?? null };
  else if (!snap.open && baseline.current.open) baseline.current = { open: false, id: null };
  const recapId = last && last.id !== baseline.current.id ? last.id : null;

  let bubbles: Bubble[] = [];
  const who = encounter?.recipient.name.split(' ')[0];
  if (encounter && who) {
    bubbles = [{ key: 'ask', text: `Asking ${who}’s Muse` }];
    if (encounter.sent > 0) bubbles.push({ key: 'sent', text: 'Message sent' });
    if (encounter.received > 0) bubbles.push({ key: 'recv', text: `${who}’s Muse replied` });
  } else if (working) {
    bubbles = [{ key: 'work', text: snap.state === 'evaluating' ? 'Looking at your photo' : 'Working on your request' }];
  } else if (snap.open && last && last.role === 'muse' && last.plan && recapId === last.id) {
    bubbles = museSteps(last.plan, last.source).map((s) => ({ key: s.key, text: s.text }));
  }
  bubbles = bubbles.slice(0, SLOTS.length);

  if (!snap.open) return null;
  return (
    <div ref={anchorRef} aria-hidden data-testid="muse-thoughts" className="pointer-events-none absolute left-0 top-0 z-[6]" style={{ ['--r' as string]: '110px' } as CSSProperties}>
      {(working || !!encounter) && (
        <>
          <span className="muse-thought-orbit" style={{ animationDuration: '5.2s' }}><i className="muse-thought-orb" style={{ width: 16, height: 16 }} /></span>
          <span className="muse-thought-orbit" style={{ animationDuration: '7.4s', animationDelay: '-2.1s' }}><i className="muse-thought-orb" style={{ width: 11, height: 11 }} /></span>
          <span className="muse-thought-orbit" style={{ animationDuration: '9.6s', animationDelay: '-5s' }}><i className="muse-thought-orb" style={{ width: 20, height: 20 }} /></span>
        </>
      )}
      {bubbles.map((b, i) => (
        <span
          key={b.key}
          className={cn('muse-thought')}
          style={{ left: `calc(var(--r) * ${SLOTS[i][0]})`, top: `calc(var(--r) * ${SLOTS[i][1]})`, animationDelay: `${i * 0.45}s` }}
        >
          {b.text}
        </span>
      ))}
    </div>
  );
}
