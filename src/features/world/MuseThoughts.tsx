'use client';
// Blue thought orbs and thought clouds around Jolly while the Muse chat is open: Muse's running
// commentary, one cloud at a time, only from things that are actually known:
//  - the request is in flight (a few orbs circle him, one cloud says so)
//  - a friend hand-off: whose Muse was asked, that the message went out, that a reply came back
//    (the real agent events; each new event shows as it happens)
//  - a photo is being looked at
//  - after a plan reply: what Muse understood, who is free, what it checked, then the pick with
//    Muse's own reason and bridge line, one after another (until your next message)
// It never invents stages or timings. World3D moves it to Jolly's screen position every frame.
import { type CSSProperties, type RefObject } from 'react';
import { useAgentEncounter, useMuseCommentary } from '@/features/muse-companion';
import { cn } from '@/features/ui';

// Cloud spots around Jolly, in units of the ring radius (--r): up left, then up right, alternating.
const SLOTS: [number, number][] = [[-1, -1.25], [1, -1.05]];

// Where the thought trail starts (up by Jolly's head, in ring radii) and its circles: how far along
// the line from the cloud to his head (0 = the cloud, 1 = his head) and the size in px.
const HEAD_Y = -0.3;
const TAIL: [number, number][] = [[0.4, 15], [0.54, 11], [0.67, 7]];

export function MuseThoughts({ anchorRef }: { anchorRef: RefObject<HTMLDivElement | null> }) {
  const c = useMuseCommentary();
  const encounter = useAgentEncounter();
  // In 3D the clouds are for the chat (the camera frames Jolly then); "I'm free" runs show in the sheet.
  // During a Muse-to-Muse encounter the scene's speech bubbles say what is happening instead.
  if (!c.open || c.source !== 'chat' || encounter) return null;
  const text = c.current?.text;
  const [sx, sy] = SLOTS[c.index % SLOTS.length];
  return (
    <div ref={anchorRef} aria-hidden data-testid="muse-thoughts" data-thought-index={text ? c.index : undefined} data-thought-count={c.thoughts.length} className="pointer-events-none absolute left-0 top-0 z-[6]" style={{ ['--r' as string]: '110px' } as CSSProperties}>
      {c.working && (
        <>
          <span className="muse-thought-orbit" style={{ animationDuration: '5.2s' }}><i className="muse-thought-orb" style={{ width: 16, height: 16 }} /></span>
          <span className="muse-thought-orbit" style={{ animationDuration: '7.4s', animationDelay: '-2.1s' }}><i className="muse-thought-orb" style={{ width: 11, height: 11 }} /></span>
          <span className="muse-thought-orbit" style={{ animationDuration: '9.6s', animationDelay: '-5s' }}><i className="muse-thought-orb" style={{ width: 20, height: 20 }} /></span>
        </>
      )}
      {text && (
        // Keyed by the line, so each new thought pops in fresh with its trail of dots.
        <span key={c.key}>
          {/* The trail of small circles that joins the cloud to Jolly's head, like a thought bubble. */}
          {TAIL.map(([t, px], k) => (
            <i
              key={k}
              className="muse-thought-dot"
              style={{
                left: `calc(var(--r) * ${(sx * (1 - t)).toFixed(3)})`,
                top: `calc(var(--r) * ${(HEAD_Y + (sy - HEAD_Y) * (1 - t)).toFixed(3)})`,
                width: px, height: px,
                animationDelay: `${(TAIL.length - k) * 0.1}s`,
              }}
            />
          ))}
          <span
            className={cn('muse-thought')}
            style={{ left: `calc(var(--r) * ${sx})`, top: `calc(var(--r) * ${sy})`, animationDelay: '0.35s' }}
          >
            {text}
          </span>
        </span>
      )}
    </div>
  );
}
