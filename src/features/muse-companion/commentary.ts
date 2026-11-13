'use client';
// Muse's running commentary, sequenced: which thought is showing now. Shared by Jolly's thought
// clouds in 3D (MuseThoughts) and Jolly hopping around the 2D map (MuseMapLayer), so both tell the
// same story from the same real events. Only plays while the Muse chat is open.
import { useEffect, useRef, useState } from 'react';
import { useAgentEncounter, useChatMessages, useMuseSnapshot } from './controller';
import { companionThoughts, stageThought, thoughtDwellMs, type Thought } from './thought-line';
import { usePlanRun } from './plan-run';
import { usePlanOpen } from '@/features/outhere/plan-state';

const WORKING = new Set(['thinking', 'evaluating', 'sending', 'receiving', 'delivering']);

export type MuseCommentary = {
  open: boolean; working: boolean;
  /** Whose work it is: the Muse chat, or an "I'm free" run from the plan sheet. */
  source: 'chat' | 'plan';
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

  // The "I'm free" sheet's run, when the chat is closed: live stages while it works, then the result's
  // commentary, for as long as the sheet is open.
  const planOpen = usePlanOpen();
  const run = usePlanRun();
  const planOn = !snap.open && planOpen && !!run && !run.failed;
  const latest = messages.at(-1);
  const thoughts = snap.open ? companionThoughts(snap.state, encounter, latest, !!recapId && latest?.id === recapId)
    : planOn && run.result ? companionThoughts('idle', null, { id: `plan:${run.id}`, role: 'muse', text: '', source: run.result.source, plan: run.result.plan, ask: '' }, true)
      : planOn ? [stageThought(run.stages)] : [];
  // One sequence per encounter, request state or reply. A hand-off jumps to its newest event; a reply
  // recap starts at its first line and steps through, holding on the last one.
  const seq = snap.open
    ? (encounter ? `enc:${encounter.id}:${encounter.outcome ?? ''}` : working ? `work:${snap.state}` : recapId ? `reply:${recapId}` : 'none')
    : planOn ? (run.result ? `plan:${run.id}` : `stage:${run.id}:${run.stages.length}`) : 'none';
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

  return { open: snap.open || planOn, source: snap.open ? 'chat' : 'plan', working: working || (planOn && !run.result), thoughts, index, current: thoughts[index] ?? null, key: `${seq}:${index}` };
}
