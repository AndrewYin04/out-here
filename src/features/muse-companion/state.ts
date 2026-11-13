// The Muse companion's state machine. Pure: the controller owns timers and the store, this file
// only says what each event does, so Vitest covers every transition.
export type MuseState =
  | 'idle' | 'approaching' | 'listening' | 'thinking' | 'responding' | 'returning'
  | 'delivering' | 'evaluating' | 'sending' | 'receiving' | 'celebrating' | 'error';

/** States a later feature drives (Side Quest envelope, Photo Judge, agent hand-offs). */
export type ExternalState = 'delivering' | 'evaluating' | 'sending' | 'receiving' | 'celebrating';

export type MuseEvent =
  | { type: 'CHAT_OPENED' }
  | { type: 'CHAT_CLOSED' }
  | { type: 'APPROACH_DONE' }
  | { type: 'RETURN_DONE' }
  | { type: 'USER_INPUT_STARTED' }
  | { type: 'USER_INPUT_ENDED' }
  | { type: 'MUSE_REQUEST_STARTED' }
  | { type: 'MUSE_RESPONSE_RECEIVED'; live?: boolean }
  | { type: 'MUSE_REQUEST_CANCELLED' }
  | { type: 'MUSE_REQUEST_FAILED' }
  | { type: 'RESPONSE_SETTLED' }
  | { type: 'PLAN_SELECTED'; questId: string }
  | { type: 'QUEST_DROPPED'; questId: string }
  | { type: 'PHOTO_EVALUATION_STARTED'; entryId: string }
  | { type: 'PHOTO_SCORED'; entryId: string }
  // Generic hooks for later features: enter an external state, then leave it.
  | { type: 'ACTION_STARTED'; state: ExternalState }
  | { type: 'ACTION_ENDED' };

export type MuseSnapshot = {
  /** Is the chat panel open (Jolly is in its foreground position)? */
  open: boolean;
  /** Request-scoped visual signal, never inferred from navigation or movement. */
  energy: 'off' | 'pending' | 'success' | 'fade';
  state: MuseState;
  /** What was last chosen from a plan, so the map can show it. Bumps `selectionSeq` on every pick. */
  selectedQuestId: string | null;
  selectionSeq: number;
};

export const INITIAL: MuseSnapshot = { open: false, energy: 'off', state: 'idle', selectedQuestId: null, selectionSeq: 0 };

/** States a user action must not interrupt (the request is in flight, or a later feature owns Muse). */
const BUSY: ReadonlySet<MuseState> = new Set(['thinking', 'delivering', 'evaluating', 'sending', 'receiving']);

export function reduce(s: MuseSnapshot, e: MuseEvent): MuseSnapshot {
  switch (e.type) {
    case 'CHAT_OPENED':
      if (s.open) return s; // rapid taps never restart the approach
      if(BUSY.has(s.state))return {...s,open:true};
      return { ...s, open: true, state: 'approaching' };
    case 'CHAT_CLOSED':
      if (!s.open) return s;
      return { ...s, open: false, energy: 'fade', state: 'returning' };
    case 'APPROACH_DONE':
      return s.state === 'approaching' ? { ...s, state: 'idle' } : s;
    case 'RETURN_DONE':
      return s.state === 'returning' ? { ...s, state: 'idle' } : s;
    case 'USER_INPUT_STARTED':
      return s.open && (s.state === 'idle' || s.state === 'error' || s.state === 'responding') ? { ...s, state: 'listening' } : s;
    case 'USER_INPUT_ENDED':
      return s.state === 'listening' ? { ...s, state: 'idle' } : s;
    case 'MUSE_REQUEST_STARTED':
      return s.open ? { ...s, state: 'thinking', energy: 'pending' } : s;
    case 'MUSE_RESPONSE_RECEIVED':
      // A reply that lands after the chat closed has nothing to talk to: stay as the close left it.
      return s.state === 'thinking' ? { ...s, state: s.open ? 'responding' : 'idle', energy: e.live === false ? 'fade' : 'success' } : s;
    case 'MUSE_REQUEST_FAILED':
      return s.state === 'thinking' ? { ...s, state: s.open ? 'error' : 'idle', energy: 'fade' } : s;
    case 'MUSE_REQUEST_CANCELLED':
      return { ...s, energy: 'fade', state: s.open ? 'idle' : 'returning' };
    case 'RESPONSE_SETTLED':
      return s.state === 'responding' ? { ...s, state: 'idle' } : s;
    case 'PLAN_SELECTED':
      return { ...s, selectedQuestId: e.questId, selectionSeq: s.selectionSeq + 1 };
    case 'ACTION_STARTED':
      return BUSY.has(s.state) && s.state !== e.state ? s : { ...s, state: e.state };
    case 'ACTION_ENDED':
      return s.state === 'delivering' || s.state === 'evaluating' || s.state === 'sending' || s.state === 'receiving' || s.state === 'celebrating'
        ? { ...s, state: s.open ? 'idle' : 'idle' } : s;
    case 'PHOTO_EVALUATION_STARTED':
      return BUSY.has(s.state) ? s : { ...s, state: 'evaluating' };
    case 'PHOTO_SCORED':
      return s.state === 'evaluating' ? { ...s, state: 'celebrating' } : s;
    case 'QUEST_DROPPED':
      return BUSY.has(s.state) ? s : { ...s, state: 'delivering' };
  }
}

/** Where the 3D pet goes and which clip it plays, from the companion's state. */
export function petPose(s: MuseSnapshot): { front: boolean; clip: 'hover' | 'think' | 'talk' | 'happy' | 'listen' | 'sad' } {
  const clip = s.state === 'thinking' || s.state === 'evaluating' ? 'think'
    : s.state === 'responding' || s.state === 'approaching' || s.state === 'delivering' || s.state === 'sending' || s.state === 'receiving' ? 'talk'
      : s.state === 'celebrating' ? 'happy' : s.state === 'listening' ? 'listen' : s.state === 'error' ? 'sad' : 'hover';
  return { front: s.open || s.state === 'delivering' || s.state === 'evaluating', clip };
}
