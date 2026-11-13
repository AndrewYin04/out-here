'use client';
// Muse's running commentary, sequenced: which thought is showing now. Shared by Jolly's thought
// clouds in 3D (MuseThoughts) and Jolly hopping around the 2D map (MuseMapLayer), so both tell the
// same story from the same real events. Only plays while the Muse chat is open.
import { useEffect, useRef, useState } from 'react';
import { useAgentEncounter, useChatMessages, useMuseSnapshot } from './controller';
import { companionThoughts, thoughtDwellMs, type Thought } from './thought-line';

const WORKING = new Set(['thinking', 'evaluating', 'sending', 'receiving', 'delivering']);

export type MuseCommentary = {
  open: boolean; working: boolean;
  thoughts: Thought[]; index: number; current: Thought | null;
  /** Changes whenever a new thought shows (a key for pop-in animations). */
  key: string;
};

export function useMuseCommentary(): MuseCommentary {
  const snap = useMuseSnapshot();
  const messages = useChatMessages();
  const encounter = useAgentEncounter();
  const working = snap.open && WORKING.has(snap.state);

  // The latest plan reply: its commentary plays after it arrives, until your next message (the
  // working thought replaces it) or until the chat closes. Only replies that arrive while this chat
  // is open count (the history is kept between sessions).
  const last = [...messages].reverse().find((m) => m.role === 'muse' && m.plan);
  const baseline = useRef<{ open: boolean; id: string | null }>({ open: false, id: null });
  if (snap.open && !baseline.current.open) baseline.current = { open: true, id: last?.id ?? null };
  else if (!snap.open && baseline.current.open) baseline.current = { open: false, id: null };
  const recapId = last && last.id !== baseline.current.id ? last.id : null;

  const latest = messages.at(-1);
  const thoughts = snap.open ? companionThoughts(snap.state, encounter, latest, !!recapId && latest?.id === recapId) : [];
  // One sequence per encounter, request state or reply. A hand-off jumps to its newest event; a reply
  // recap starts at its first line and steps through, holding on the last one.
  const seq = encounter ? `enc:${encounter.id}:${encounter.outcome ?? ''}` : working ? `work:${snap.state}` : recapId ? `reply:${recapId}` : 'none';
  const live = !!encounter;
  const lastIndex = Math.max(0, thoughts.length - 1);
  const [at, setAt] = useState<{ seq: string; i: number }>({ seq, i: 0 });
  const index = at.seq === seq ? Math.min(at.i, lastIndex) : live ? lastIndex : 0;
  if (at.seq !== seq || (live && index < lastIndex)) setAt({ seq, i: live ? lastIndex : index });

  const text = thoughts[index]?.text;
  useEffect(() => {
    if (live || !text || index >= thoughts.length - 1) return;
    const t = window.setTimeout(() => setAt((a) => (a.seq === seq ? { seq, i: a.i + 1 } : a)), thoughtDwellMs(text));
    return () => window.clearTimeout(t);
  }, [seq, index, text, live, thoughts.length]);

  return { open: snap.open, working, thoughts, index, current: thoughts[index] ?? null, key: `${seq}:${index}` };
}
