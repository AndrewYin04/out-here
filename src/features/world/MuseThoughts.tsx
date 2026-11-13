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
import { companionThought } from './thought-line';
import { cn } from '@/features/ui';

const WORKING = new Set(['thinking', 'evaluating', 'sending', 'receiving', 'delivering']);
// Bubble spots around Jolly, in units of the ring radius (--r): left, right, left, right.
const SLOTS: [number, number][] = [[-1, -1.25]];

// Where the thought trail starts (up by Jolly's head, in ring radii) and its circles: how far along
// the line from the cloud to his head (0 = the cloud, 1 = his head) and the size in px.
const HEAD_Y = -0.3;
const TAIL: [number, number][] = [[0.4, 15], [0.54, 11], [0.67, 7]];

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

  const latest=messages.at(-1);
  const text=companionThought(snap.state,encounter,latest,!!recapId&&latest?.id===recapId);
  const bubbles:Bubble[]=text?[{key:encounter?`${encounter.id}:${encounter.sent}:${encounter.received}:${encounter.outcome}`:working?snap.state:recapId??'reply',text:text.length>110?`${text.slice(0,109).trimEnd()}…`:text}]:[];

  if (!snap.open) return null;
  return (
    <div ref={anchorRef} aria-hidden data-testid="muse-thoughts" className="pointer-events-none absolute left-0 top-0 z-[6]" style={{ ['--r' as string]: '110px' } as CSSProperties}>
      {(working && !encounter?.outcome) && (
        <>
          <span className="muse-thought-orbit" style={{ animationDuration: '5.2s' }}><i className="muse-thought-orb" style={{ width: 16, height: 16 }} /></span>
          <span className="muse-thought-orbit" style={{ animationDuration: '7.4s', animationDelay: '-2.1s' }}><i className="muse-thought-orb" style={{ width: 11, height: 11 }} /></span>
          <span className="muse-thought-orbit" style={{ animationDuration: '9.6s', animationDelay: '-5s' }}><i className="muse-thought-orb" style={{ width: 20, height: 20 }} /></span>
        </>
      )}
      {bubbles.map((b, i) => {
        const [sx, sy] = SLOTS[i];
        return (
          <span key={b.key}>
            {/* The trail of small circles that joins the cloud to Jolly's head, like a thought bubble. */}
            {TAIL.map(([t, px], k) => (
              <i
                key={k}
                className="muse-thought-dot"
                style={{
                  left: `calc(var(--r) * ${(sx * (1 - t)).toFixed(3)})`,
                  top: `calc(var(--r) * ${(HEAD_Y + (sy - HEAD_Y) * (1 - t)).toFixed(3)})`,
                  width: px, height: px,
                  animationDelay: `${i * 0.45 + (TAIL.length - k) * 0.1}s`,
                }}
              />
            ))}
            <span
              className={cn('muse-thought')}
              style={{ left: `calc(var(--r) * ${sx})`, top: `calc(var(--r) * ${sy})`, animationDelay: `${i * 0.45 + 0.35}s` }}
            >
              {b.text}
            </span>
          </span>
        );
      })}
    </div>
  );
}
