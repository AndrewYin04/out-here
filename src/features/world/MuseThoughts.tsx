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
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { useAgentEncounter, useChatMessages, useMuseSnapshot } from '@/features/muse-companion';
import { companionThoughts, thoughtDwellMs } from './thought-line';
import { cn } from '@/features/ui';

const WORKING = new Set(['thinking', 'evaluating', 'sending', 'receiving', 'delivering']);
// Cloud spots around Jolly, in units of the ring radius (--r): up left, then up right, alternating.
const SLOTS: [number, number][] = [[-1, -1.25], [1, -1.05]];

// Where the thought trail starts (up by Jolly's head, in ring radii) and its circles: how far along
// the line from the cloud to his head (0 = the cloud, 1 = his head) and the size in px.
const HEAD_Y = -0.3;
const TAIL: [number, number][] = [[0.4, 15], [0.54, 11], [0.67, 7]];

export function MuseThoughts({ anchorRef }: { anchorRef: RefObject<HTMLDivElement | null> }) {
  const snap = useMuseSnapshot();
  const messages = useChatMessages();
  const encounter = useAgentEncounter();
  const working = snap.open && WORKING.has(snap.state);

  // The latest plan reply: its commentary plays after it arrives.
  const last = [...messages].reverse().find((m) => m.role === 'muse' && m.plan);
  // It stays until your next message (the working cloud replaces it) or until the chat closes.
  // Only replies that arrive while this chat is open count (the history is kept between sessions).
  const baseline = useRef<{ open: boolean; id: string | null }>({ open: false, id: null });
  if (snap.open && !baseline.current.open) baseline.current = { open: true, id: last?.id ?? null };
  else if (!snap.open && baseline.current.open) baseline.current = { open: false, id: null };
  const recapId = last && last.id !== baseline.current.id ? last.id : null;

  const latest = messages.at(-1);
  const lines = companionThoughts(snap.state, encounter, latest, !!recapId && latest?.id === recapId);
  // One sequence per encounter, request state or reply. A hand-off jumps to its newest event; a reply
  // recap starts at its first line and steps through, holding on the last one.
  const seq = encounter ? `enc:${encounter.id}:${encounter.outcome ?? ''}` : working ? `work:${snap.state}` : recapId ? `reply:${recapId}` : 'none';
  const live = !!encounter;
  const [at, setAt] = useState<{ seq: string; i: number }>({ seq, i: 0 });
  const i = at.seq === seq ? Math.min(at.i, Math.max(0, lines.length - 1)) : live ? Math.max(0, lines.length - 1) : 0;
  if (at.seq !== seq || (live && i < lines.length - 1)) setAt({ seq, i: live ? Math.max(0, lines.length - 1) : i });

  const text = lines[i];
  useEffect(() => {
    if (live || !text || i >= lines.length - 1) return;
    const t = window.setTimeout(() => setAt((a) => (a.seq === seq ? { seq, i: a.i + 1 } : a)), thoughtDwellMs(text));
    return () => window.clearTimeout(t);
  }, [seq, i, text, live, lines.length]);

  if (!snap.open) return null;
  const [sx, sy] = SLOTS[i % SLOTS.length];
  return (
    <div ref={anchorRef} aria-hidden data-testid="muse-thoughts" data-thought-index={text ? i : undefined} data-thought-count={lines.length} className="pointer-events-none absolute left-0 top-0 z-[6]" style={{ ['--r' as string]: '110px' } as CSSProperties}>
      {(working && !encounter?.outcome) && (
        <>
          <span className="muse-thought-orbit" style={{ animationDuration: '5.2s' }}><i className="muse-thought-orb" style={{ width: 16, height: 16 }} /></span>
          <span className="muse-thought-orbit" style={{ animationDuration: '7.4s', animationDelay: '-2.1s' }}><i className="muse-thought-orb" style={{ width: 11, height: 11 }} /></span>
          <span className="muse-thought-orbit" style={{ animationDuration: '9.6s', animationDelay: '-5s' }}><i className="muse-thought-orb" style={{ width: 20, height: 20 }} /></span>
        </>
      )}
      {text && (
        // Keyed by the line, so each new thought pops in fresh with its trail of dots.
        <span key={`${seq}:${i}`}>
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
